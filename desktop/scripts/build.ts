// Builds everything the desktop app runs into desktop/dist. Run: npm run build -w desktop
//
//   main.cjs, preload.cjs   Electron main process and page bridge
//   server/server.mjs       API, bundled, because Node won't strip types under node_modules
//   server/searchWorker.mjs search worker, found beside server.mjs at run time
//   server/node_modules     the native canvas module, which can't be bundled
//   server/data, pieces, web the opening book, piece images and built UI
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const desktop = fileURLToPath(new URL('..', import.meta.url));
const repo = join(desktop, '..');
const dist = join(desktop, 'dist');
const server = join(dist, 'server');

rmSync(dist, { recursive: true, force: true });
mkdirSync(server, { recursive: true });

execSync('npm run build -w web', { cwd: repo, stdio: 'inherit' });

await build({
  entryPoints: { main: join(desktop, 'src/main.ts'), preload: join(desktop, 'src/preload.ts') },
  outdir: dist,
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['electron'],
  logLevel: 'warning',
});

await build({
  entryPoints: {
    server: join(repo, 'api/src/server.ts'),
    searchWorker: join(repo, 'api/src/engine/searchWorker.ts'),
  },
  outdir: server,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['@napi-rs/canvas'],
  // Express and pino are CommonJS, and their calls to require() need a real one in an ES module.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: 'warning',
});

// The native module and its platform binary, which is an optional dependency named after the platform.
const canvas = join(repo, 'node_modules/@napi-rs/canvas');
const { optionalDependencies } = JSON.parse(readFileSync(join(canvas, 'package.json'), 'utf8')) as {
  optionalDependencies: Record<string, string>;
};
const installed = ['@napi-rs/canvas', ...Object.keys(optionalDependencies)].filter((name) =>
  existsSync(join(repo, 'node_modules', name)),
);
if (installed.length < 2) throw new Error('The native canvas binary for this platform is not installed.');
for (const name of installed) {
  cpSync(join(repo, 'node_modules', name), join(server, 'node_modules', name), { recursive: true });
}

cpSync(join(repo, 'data/cach_openingbook.txt'), join(server, 'data/cach_openingbook.txt'));
cpSync(join(repo, 'shared/assets/pieces'), join(server, 'pieces'), { recursive: true });
cpSync(join(repo, 'web/dist'), join(server, 'web'), { recursive: true });

console.log(`Desktop app built in ${dist}`);
