import { pino } from 'pino';
import { OpeningBook } from './book/openingBook.ts';
import { config } from './config.ts';
import { EngineService } from './engine/engineService.ts';
import { SearchPool } from './engine/searchPool.ts';
import { createApp } from './http/app.ts';
import { GameStore } from './store/gameStore.ts';

const logger = pino({ level: config.logLevel });
const store = new GameStore();
const pool = new SearchPool(config.searchWorkers);
let engine: EngineService | null = null;
let bookNodes = 0;

const app = createApp({ store, engine: () => engine, bookNodes: () => bookNodes, logger });
const server = app.listen(config.port, '127.0.0.1', () => {
  logger.info(`Cach API listening on http://127.0.0.1:${config.port}`);
});

const sweep = setInterval(() => store.evictIdle(), 60 * 60 * 1000);
sweep.unref();

try {
  const started = Date.now();
  const book = await OpeningBook.load(config.bookPath);
  bookNodes = book.nodeCount;
  engine = new EngineService(book, pool, config.searchDepth);
  logger.info({ nodes: bookNodes, ms: Date.now() - started }, 'opening book loaded');
} catch (err) {
  logger.fatal({ err, path: config.bookPath }, 'could not load the opening book');
  process.exit(1);
}

const shutdown = (): void => {
  server.close();
  void pool.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
