// Worker thread entry: runs one search per message, from a FEN and the positions that can still repeat.
import { parentPort } from 'node:worker_threads';
import { parseFen } from '../core/fen.ts';
import { searchRoot } from './search.ts';

parentPort?.on('message', ({ id, fen, depth, history }: { id: number; fen: string; depth: number; history: string[] }) => {
  try {
    parentPort?.postMessage({ id, result: searchRoot(parseFen(fen), depth, history) });
  } catch (e) {
    parentPort?.postMessage({ id, error: e instanceof Error ? e.message : String(e) });
  }
});
