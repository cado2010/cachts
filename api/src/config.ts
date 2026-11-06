import { fileURLToPath } from 'node:url';

const intFrom = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  return value !== undefined && Number.isInteger(n) && n > 0 ? n : fallback;
};

export const config = {
  port: intFrom(process.env.PORT, 3001),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  bookPath: process.env.CACH_BOOK_PATH
    ?? fileURLToPath(new URL('../../data/cach_openingbook.txt', import.meta.url)),
  webDist: process.env.CACH_WEB_DIST
    ?? fileURLToPath(new URL('../../web/dist/', import.meta.url)),
  piecesDir: process.env.CACH_PIECES_DIR
    ?? fileURLToPath(new URL('../../shared/assets/pieces/', import.meta.url)),
  searchWorkers: intFrom(process.env.CACH_SEARCH_WORKERS, 2),
  searchDepth: intFrom(process.env.CACH_SEARCH_DEPTH, 4),
};
