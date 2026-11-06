#!/usr/bin/env node
// The `cachts` command: starts the desktop app, from any directory.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const { status } = spawnSync('npm', ['run', 'desktop'], { cwd: root, stdio: 'inherit', shell: true });
process.exit(status ?? 1);
