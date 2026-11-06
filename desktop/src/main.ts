// Electron main process: starts the API, waits for it, shows the UI it serves, and stops it on exit.
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Menu, session, utilityProcess, type UtilityProcess } from 'electron';

const STARTUP_TIMEOUT_MS = 60_000;
const MAX_RENDERER_RECOVERIES = 3;
const CHANNEL = {
  closeHandler: 'cach:close-handler',
  closeRequested: 'cach:close-requested',
  closeConfirmed: 'cach:close-confirmed',
};

let server: UtilityProcess | null = null;
let serverLog: WriteStream | null = null;
let quitting = false;

const logPath = (): string => join(app.getPath('logs'), 'server.log');

function fail(title: string, detail: string): void {
  if (quitting) return;
  quitting = true;
  dialog.showErrorBox(title, `${detail}\n\nLog: ${logPath()}`);
  server?.kill();
  app.exit(1);
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => {
        if (address && typeof address === 'object') resolve(address.port);
        else reject(new Error('No port was assigned.'));
      });
    });
  });
}

function startServer(port: number): void {
  // Packaged, the server folder sits beside the app archive, because it holds native code and
  // worker files that can't run from inside one. See desktop/scripts/build.ts for its contents.
  const root = app.isPackaged ? join(process.resourcesPath, 'server') : join(__dirname, 'server');
  mkdirSync(app.getPath('logs'), { recursive: true });
  serverLog = createWriteStream(logPath());

  server = utilityProcess.fork(join(root, 'server.mjs'), [], {
    serviceName: 'Cach API',
    stdio: 'pipe',
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'production',
      CACH_BOOK_PATH: join(root, 'data', 'cach_openingbook.txt'),
      CACH_PIECES_DIR: join(root, 'pieces'),
      CACH_WEB_DIST: join(root, 'web'),
    },
  });
  server.stdout?.pipe(serverLog);
  server.stderr?.pipe(serverLog);
  server.on('exit', (code) => {
    server = null;
    fail('Cach has stopped', `The chess server stopped unexpectedly (exit code ${code}). Any game in progress is lost.`);
  });
}

async function waitUntilReady(origin: string): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const health = await fetch(`${origin}/api/health`);
      if (health.ok && ((await health.json()) as { status: string }).status === 'ready') return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('The chess server did not become ready in time.');
}

function secureSession(origin: string): void {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, decide) => decide(false));
  session.defaultSession.webRequest.onHeadersReceived((details, respond) => {
    respond({
      responseHeaders: {
        ...details.responseHeaders,
        // Inline styles are how the board positions and sizes its squares.
        'Content-Security-Policy': [
          `default-src 'none'; script-src ${origin}; style-src ${origin} 'unsafe-inline'; img-src ${origin} data:; connect-src ${origin}; font-src ${origin}; base-uri 'none'; form-action 'none'`,
        ],
      },
    });
  });
}

function createWindow(origin: string): BrowserWindow {
  const win = new BrowserWindow({
    title: 'Cach',
    width: 1120,
    height: 860,
    minWidth: 420,
    minHeight: 600,
    show: false,
    useContentSize: true,
    backgroundColor: '#f3f1ed',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const contents = win.webContents;

  win.once('ready-to-show', () => win.show());
  win.on('page-title-updated', (event) => event.preventDefault());

  // The page is the only thing this window ever shows.
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== origin) event.preventDefault();
  });

  // Closing stops the server, which loses the game, so the page gets to ask first (design 10.7).
  // Until the page says it can answer, or once it can't, the window simply closes.
  let closeHandlerReady = false;
  let closeConfirmed = false;
  const onCloseHandler = (event: Electron.IpcMainEvent, ready: boolean): void => {
    if (event.sender === contents) closeHandlerReady = ready;
  };
  const onCloseConfirmed = (event: Electron.IpcMainEvent): void => {
    if (event.sender !== contents) return;
    closeConfirmed = true;
    win.close();
  };
  ipcMain.on(CHANNEL.closeHandler, onCloseHandler);
  ipcMain.on(CHANNEL.closeConfirmed, onCloseConfirmed);
  win.on('close', (event) => {
    if (closeConfirmed || !closeHandlerReady) return;
    event.preventDefault();
    contents.send(CHANNEL.closeRequested);
  });
  win.once('closed', () => {
    ipcMain.off(CHANNEL.closeHandler, onCloseHandler);
    ipcMain.off(CHANNEL.closeConfirmed, onCloseConfirmed);
  });
  contents.on('did-start-navigation', (details) => {
    if (details.isMainFrame) closeHandlerReady = false;
  });
  win.on('unresponsive', () => {
    closeHandlerReady = false;
  });
  // Windows is shutting down or signing out, which a popup must not hold up.
  win.on('session-end', () => {
    closeConfirmed = true;
  });

  // The game is safe on the server, so a page crash can recover through the reload popup.
  let recoveries = 0;
  contents.on('render-process-gone', (_event, details) => {
    closeHandlerReady = false;
    if (details.reason === 'clean-exit' || quitting) return;
    if (++recoveries > MAX_RENDERER_RECOVERIES) fail('Cach has stopped', `The window keeps crashing (${details.reason}).`);
    else contents.reload();
  });

  // There's no menu bar, so editing commands for the Move/FEN box come from a context menu.
  contents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return;
    Menu.buildFromTemplate([
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll' },
    ]).popup({ window: win });
  });

  void win.loadURL(origin);
  return win;
}

async function launch(): Promise<void> {
  // No menu also means no built-in reload command, so reload shortcuts reach the page's popup.
  Menu.setApplicationMenu(null);
  const port = await findFreePort();
  const origin = `http://127.0.0.1:${port}`;
  secureSession(origin);
  startServer(port);
  await waitUntilReady(origin);
  const win = createWindow(origin);

  app.on('second-instance', () => {
    if (win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
}

if (!app.requestSingleInstanceLock()) {
  // A window is already open, and the second-instance event above brings it forward.
  app.quit();
} else {
  app.setAppUserModelId('com.cach.chess');
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    quitting = true;
  });
  app.on('will-quit', () => {
    server?.kill();
  });
  app.whenReady().then(launch).catch((err: unknown) => {
    fail('Cach could not start', err instanceof Error ? err.message : String(err));
  });
}
