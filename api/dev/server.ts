// `npm run dev` entry point for the API. See devRunner.ts for why this isn't `node --watch`.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runWatched } from './devRunner.ts';

const api = fileURLToPath(new URL('..', import.meta.url));
const run = runWatched({
  dirs: [join(api, 'src'), join(api, '..', 'shared', 'src')],
  script: join(api, 'src', 'server.ts'),
  cwd: api,
});

const shutdown = (): void => {
  void run.stop().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
