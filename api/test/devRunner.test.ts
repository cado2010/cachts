import { appendFileSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { changedFiles, runWatched, takeSnapshot, type WatchedRun } from '../dev/devRunner.ts';

// Long enough for a false restart to have shown itself, given the runner's 100 ms settling time.
const QUIET_MS = 1000;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('dev runner', () => {
  let root: string;
  let watched: string;
  let run: WatchedRun | undefined;

  const starts = (): number => readFileSync(join(root, 'starts.txt'), 'utf8').length;
  const waitForStarts = async (expected: number): Promise<void> => {
    for (let i = 0; i < 200 && starts() < expected; i++) await delay(25);
    expect(starts()).toBe(expected);
  };
  const ageLastAccess = (path: string): void => {
    utimesSync(path, new Date(Date.now() - 3 * 3600 * 1000), statSync(path).mtime);
  };
  const launch = async (): Promise<void> => {
    run = runWatched({ dirs: [root], script: join(root, 'child.mjs'), cwd: root, stdio: 'ignore', log: () => {} });
    await waitForStarts(1);
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cach-dev-'));
    watched = join(root, 'watched.ts');
    writeFileSync(watched, 'export const a = 1;\n');
    writeFileSync(join(root, 'starts.txt'), '');
    // Records each start, then stays alive like a server.
    writeFileSync(
      join(root, 'child.mjs'),
      `import { appendFileSync } from 'node:fs';
       appendFileSync('starts.txt', 'x');
       setInterval(() => {}, 1000);`,
    );
  });
  afterEach(async () => {
    await run?.stop();
    run = undefined;
    rmSync(root, { recursive: true, force: true });
  });

  it('does not restart when a file with a stale access time is only read', async () => {
    ageLastAccess(watched);
    await launch();
    readFileSync(watched);
    await delay(QUIET_MS);
    expect(starts()).toBe(1);
  });

  it('does not count a read of a stale file as a change', () => {
    ageLastAccess(watched);
    const before = takeSnapshot([root]);
    readFileSync(watched);
    expect(changedFiles(before, takeSnapshot([root]))).toEqual([]);
  });

  it('restarts once when a file is edited', async () => {
    await launch();
    await delay(50);
    appendFileSync(watched, 'export const b = 2;\n');
    await waitForStarts(2);
    await delay(QUIET_MS);
    expect(starts()).toBe(2);
  });

  it('restarts when a file is added or deleted', async () => {
    await launch();
    await delay(50);
    writeFileSync(join(root, 'added.ts'), 'export {};\n');
    await waitForStarts(2);
    await delay(300);
    unlinkSync(join(root, 'added.ts'));
    await waitForStarts(3);
  });

  it('ignores files that are not TypeScript', async () => {
    await launch();
    await delay(50);
    writeFileSync(join(root, 'notes.txt'), 'hello');
    await delay(QUIET_MS);
    expect(starts()).toBe(1);
  });

  it('starts again on the next change after the server has crashed', async () => {
    writeFileSync(
      join(root, 'child.mjs'),
      `import { appendFileSync } from 'node:fs';
       appendFileSync('starts.txt', 'x');
       process.exit(1);`,
    );
    await launch();
    await delay(200);
    appendFileSync(watched, '// edit\n');
    await waitForStarts(2);
  });
});
