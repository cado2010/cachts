// The desktop app, launched for real. Nothing here starts a server: the app must do that itself.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

const desktop = fileURLToPath(new URL('..', import.meta.url));
const exe = process.env.CACH_DESKTOP_EXE;

function launch(): Promise<ElectronApplication> {
  return electron.launch(exe ? { executablePath: exe } : { args: [join(desktop, 'dist/main.cjs')], cwd: desktop });
}

const moveBox = (page: Page) => page.getByLabel('Move/FEN:');
const moveList = (page: Page) => page.getByTestId('move-list');
const dialog = (page: Page) => page.getByRole('dialog');
const square = (page: Page, name: string) => page.locator(`[data-square="${name}"]`);

async function typeMove(page: Page, move: string): Promise<void> {
  await moveBox(page).fill(move);
  await page.getByRole('button', { name: 'Move', exact: true }).click();
}
const requestClose = (app: ElectronApplication): Promise<void> =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
const serverAnswers = async (origin: string): Promise<boolean> => {
  try {
    return (await fetch(`${origin}/api/health`)).ok;
  } catch {
    return false;
  }
};

let app: ElectronApplication | undefined;
let page: Page;

test.beforeEach(async () => {
  app = await launch();
  page = await app.firstWindow();
  await expect(moveBox(page)).toBeVisible({ timeout: 30_000 });
});
test.afterEach(async () => {
  // Bypasses the close popup, for tests that end with a game in progress.
  await app?.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => {});
  app = undefined;
});

test('starts its own server and plays the opening book', async () => {
  expect(new URL(page.url()).hostname).toBe('127.0.0.1');
  await typeMove(page, 'e4');
  await expect(moveList(page)).toHaveText(/^1\. e4 \S+$/, { timeout: 30_000 });
});

test('searches in worker threads when out of book', async () => {
  await moveBox(page).fill('r1bqkb1r/pp3ppp/2n1pn2/2pp4/3P4/2N1PN2/PPP1BPPP/R1BQK2R w KQkq - 0 1');
  await page.getByRole('button', { name: 'Create Board' }).click();
  await dialog(page).getByRole('button', { name: 'OK' }).click();
  await expect(moveBox(page)).toHaveValue('');
  await typeMove(page, 'O-O');
  await expect(moveList(page)).toHaveText(/^1\. O-O \S+$/, { timeout: 60_000 });
});

test('renders piece images, and the PNG route with its native module', async () => {
  const image = await page.evaluate(async () => {
    const created = await fetch('/api/games', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const { id } = (await created.json()) as { id: string };
    const res = await fetch(`/api/games/${id}/board.png`);
    return { status: res.status, type: res.headers.get('content-type'), bytes: (await res.arrayBuffer()).byteLength };
  });
  expect(image.status).toBe(200);
  expect(image.type).toContain('image/png');
  expect(image.bytes).toBeGreaterThan(1000);
  await expect(square(page, 'e1').locator('img')).toHaveJSProperty('complete', true);
  expect(await square(page, 'e1').locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});

test('has no menu, and no page errors or blocked resources', async () => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.reload();
  await expect(moveBox(page)).toBeVisible();
  expect(await app!.evaluate(({ Menu }) => Menu.getApplicationMenu() === null)).toBe(true);
  expect(errors).toEqual([]);
});

test('the page cannot reach Node or open other sites', async () => {
  const reach = await page.evaluate(() => ({
    require: typeof (window as unknown as { require?: unknown }).require,
    process: typeof (window as unknown as { process?: unknown }).process,
    bridge: Object.keys((window as unknown as { cachDesktop?: object }).cachDesktop ?? {}).sort(),
    popup: window.open('https://example.com') === null,
  }));
  expect(reach).toEqual({ require: 'undefined', process: 'undefined', bridge: ['confirmClose', 'onCloseRequested'], popup: true });
  expect(app!.windows()).toHaveLength(1);
});

test('a reload shortcut during a game shows the popup, and can be cancelled or confirmed', async () => {
  await typeMove(page, 'e4');
  await expect(moveList(page)).toHaveText(/^1\. e4 \S+$/, { timeout: 30_000 });
  await page.keyboard.press('F5');
  await expect(dialog(page)).toContainText('Reloading will lose the current game');
  await dialog(page).getByRole('button', { name: 'Keep playing' }).click();
  await expect(moveList(page)).toContainText('1. e4');

  await page.keyboard.press('Control+r');
  await dialog(page).getByRole('button', { name: 'Reload' }).click();
  await expect(moveList(page)).toHaveText('');
  await expect(square(page, 'e2')).toHaveAttribute('data-piece', 'wp');
});

test('closing with nothing to lose closes at once and stops the server', async () => {
  const origin = new URL(page.url()).origin;
  expect(await serverAnswers(origin)).toBe(true);
  const closed = app!.waitForEvent('close');
  await requestClose(app!);
  await closed;
  app = undefined;
  await expect.poll(() => serverAnswers(origin)).toBe(false);
});

test('closing during a game asks first, and keeps the game if cancelled', async () => {
  const origin = new URL(page.url()).origin;
  await typeMove(page, 'e4');
  await expect(moveList(page)).toHaveText(/^1\. e4 \S+$/, { timeout: 30_000 });
  const line = await moveList(page).textContent();

  await requestClose(app!);
  await expect(dialog(page)).toContainText('Closing will lose the current game');
  await dialog(page).getByRole('button', { name: 'Keep playing' }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(moveList(page)).toHaveText(line as string);
  expect(await serverAnswers(origin)).toBe(true);

  await requestClose(app!);
  const closed = app!.waitForEvent('close');
  await dialog(page).getByRole('button', { name: 'Close', exact: true }).click();
  await closed;
  app = undefined;
  await expect.poll(() => serverAnswers(origin)).toBe(false);
});

test('a second launch exits and leaves the first window running', async () => {
  const second = await launch().catch(() => null);
  if (second) {
    await expect.poll(() => second.windows().length).toBe(0);
    await second.close().catch(() => {});
  }
  await typeMove(page, 'e4');
  await expect(moveList(page)).toHaveText(/^1\. e4 \S+$/, { timeout: 30_000 });
});
