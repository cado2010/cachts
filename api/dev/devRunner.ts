// Runs a Node script and restarts it when a watched .ts file really changes.
//
// This replaces `node --watch`, which restarts on any file event. On Windows, reading a file
// whose last-access time is over an hour old raises a change event, so the first start after an
// idle hour restarted the server for no reason and lost its in-memory games. Events here only
// prompt a comparison of modified times and sizes, which reading a file doesn't alter.
import { spawn, type ChildProcess } from 'node:child_process';
import { readdirSync, statSync, watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';

const SETTLE_MS = 100;

export type Snapshot = Map<string, string>;

export function takeSnapshot(dirs: readonly string[]): Snapshot {
  const snapshot: Snapshot = new Map();
  for (const dir of dirs) {
    for (const name of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
      if (!name.endsWith('.ts')) continue;
      const path = join(dir, name);
      try {
        const { mtimeMs, size } = statSync(path);
        snapshot.set(path, `${mtimeMs}:${size}`);
      } catch {
        // Deleted since the directory was listed, so it counts as gone.
      }
    }
  }
  return snapshot;
}

/** The files that were added, removed or modified between two snapshots. */
export function changedFiles(before: Snapshot, after: Snapshot): string[] {
  const changed = [...after].filter(([path, sig]) => before.get(path) !== sig).map(([path]) => path);
  const removed = [...before.keys()].filter((path) => !after.has(path));
  return [...changed, ...removed];
}

export interface WatchedRun {
  stop(): Promise<void>;
}

export function runWatched(options: {
  dirs: readonly string[];
  script: string;
  cwd: string;
  stdio?: 'inherit' | 'ignore';
  log?: (message: string) => void;
}): WatchedRun {
  const { dirs, script, cwd, stdio = 'inherit', log = console.log } = options;
  let snapshot = takeSnapshot(dirs);
  let child: ChildProcess | null = null;
  let restartPending = false;
  let stopping = false;
  let settle: NodeJS.Timeout | undefined;
  let stopped: () => void = () => {};

  const start = (): void => {
    const running = spawn(process.execPath, [script], { cwd, stdio });
    child = running;
    running.on('exit', () => {
      child = null;
      if (stopping) stopped();
      else if (restartPending) {
        // Starting only after the exit means the new server can always take the port.
        restartPending = false;
        start();
      } else log('[dev] server exited, waiting for a file change');
    });
  };

  const check = (): void => {
    const next = takeSnapshot(dirs);
    const changed = changedFiles(snapshot, next);
    snapshot = next;
    if (changed.length === 0 || stopping) return;
    log(`[dev] restarting, changed: ${changed.join(', ')}`);
    if (child) {
      restartPending = true;
      child.kill();
    } else start();
  };

  const watchers: FSWatcher[] = dirs.map((dir) =>
    watch(dir, { recursive: true }, () => {
      clearTimeout(settle);
      settle = setTimeout(check, SETTLE_MS);
    }),
  );
  start();

  return {
    stop() {
      stopping = true;
      clearTimeout(settle);
      for (const watcher of watchers) watcher.close();
      if (!child) return Promise.resolve();
      return new Promise((resolve) => {
        stopped = resolve;
        child?.kill();
      });
    },
  };
}
