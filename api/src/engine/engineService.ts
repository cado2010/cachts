// Chooses and plays a move for a side: book first, then search. Design section 8.4.
import type { EngineMoveInfo } from '@cachts/shared';
import type { OpeningBook } from '../book/openingBook.ts';
import type { Game } from '../core/game.ts';
import { sanBase } from '../core/notation.ts';
import { applyPreferences } from './filter.ts';
import type { Searcher } from './searchPool.ts';

export type Rng = (exclusiveMax: number) => number;
export const defaultRng: Rng = (max) => Math.floor(Math.random() * max);

export class EngineService {
  private readonly book: OpeningBook;
  private readonly searcher: Searcher;
  private readonly depth: number;
  private readonly rng: Rng;

  constructor(book: OpeningBook, searcher: Searcher, depth: number, rng: Rng = defaultRng) {
    this.book = book;
    this.searcher = searcher;
    this.depth = depth;
    this.rng = rng;
  }

  /** Plays one move for the side to move. The caller checks turn and game-over. */
  async playMove(game: Game, byEngine: boolean): Promise<EngineMoveInfo> {
    const started = Date.now();
    const bookMoves = this.bookMoves(game);
    if (bookMoves.length > 0) {
      const move = bookMoves[this.rng(bookMoves.length)];
      game.play(move, byEngine);
      return {
        san: game.history.at(-1)!.san,
        source: 'book',
        value: null,
        candidates: bookMoves.length,
        nodes: 0,
        elapsedMs: Date.now() - started,
      };
    }

    const historyLength = game.history.length;
    const result = await this.searcher.search(game.fen(), this.depth, game.repetitionHistory());
    if (game.history.length !== historyLength) throw new Error('Game changed during search');
    const pool = applyPreferences(game, result.candidates);
    const move = pool[this.rng(pool.length)];
    game.play(move, byEngine);
    return {
      san: game.history.at(-1)!.san,
      source: 'search',
      value: result.value,
      candidates: pool.length,
      nodes: result.nodes,
      elapsedMs: Date.now() - started,
    };
  }

  /** Book replies that are legal here, only for games from the standard start (E11, E13, E14). */
  private bookMoves(game: Game): number[] {
    if (!game.isStandardStart) return [];
    const plies = this.book.lookup(game.bookPlies);
    if (plies.length === 0) return [];
    const legal = game.pos.generateLegal();
    const bySan = new Map(legal.map((m) => [sanBase(game.pos, m, legal), m]));
    return plies.flatMap((ply) => {
      const move = bySan.get(ply);
      return move === undefined ? [] : [move];
    });
  }
}
