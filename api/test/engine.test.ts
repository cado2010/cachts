// Search behaviour, design decisions, evaluation fixtures and the real opening book.
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { MAX_BOOK_PLIES, OpeningBook, fixPly } from '../src/book/openingBook.ts';
import { config } from '../src/config.ts';
import { parseFen, START_FEN } from '../src/core/fen.ts';
import { Game } from '../src/core/game.ts';
import { san } from '../src/core/notation.ts';
import { BLACK, WHITE } from '../src/core/position.ts';
import { EngineService } from '../src/engine/engineService.ts';
import { evaluate } from '../src/engine/evaluator.ts';
import { SearchPool, type Searcher } from '../src/engine/searchPool.ts';
import { minimaxRoot, searchRoot } from '../src/engine/search.ts';

const sans = (fen: string, depth: number): string[] => {
  const pos = parseFen(fen);
  return searchRoot(pos, depth).candidates.map((m) => san(pos, m));
};
const inlineSearcher: Searcher = {
  search: async (fen, depth) => searchRoot(parseFen(fen), depth),
  close: async () => {},
};

describe('evaluation matches the C# BoardEvaluator', () => {
  const fixtures = JSON.parse(readFileSync(new URL('./fixtures/eval.json', import.meta.url), 'utf8')) as
    { fen: string; color: 'white' | 'black'; value: number }[];
  it('has fixtures', () => expect(fixtures.length).toBeGreaterThan(20));
  it.each(fixtures)('$fen from $color = $value', ({ fen, color, value }) => {
    expect(evaluate(parseFen(fen), color === 'white' ? WHITE : BLACK)).toBe(value);
  });
});

describe('design decisions', () => {
  it('D2 prefers the fastest mate', () => {
    const list = sans('7k/5K2/8/6Q1/8/8/8/8 w - -', 4);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((s) => s.endsWith('#'))).toBe(true);
  });
  it('D2 plays a back-rank mate at once rather than delaying it', () => {
    expect(sans('6k1/5ppp/8/8/8/8/8/R5K1 w - -', 4)).toEqual(['Ra8#']);
  });
  it('ported EngineTests: a two-level search returns moves', () => {
    expect(searchRoot(parseFen(START_FEN), 2).candidates.length).toBeGreaterThan(0);
  });
  it('D3 search finds a knight promotion that mates', () => {
    expect(sans('6nb/5Ppk/6pp/8/8/8/8/K7 w - -', 2)).toContain('f8=N#');
  });
  it('insufficient material is a draw in search and in play', () => {
    const g = new Game('8/8/8/4k3/8/8/4K3/7n w - -');
    expect(g.status).toEqual({ state: 'draw', reason: 'insufficient-material' });
    expect(new Game('8/8/8/4k3/8/8/4K3/8 w - -').isOver).toBe(true);
    expect(new Game('8/8/5b2/4k3/8/8/4K3/2B5 w - -').isOver).toBe(true); // f6 and c1: same colour.
    expect(new Game('8/8/8/4kb2/8/8/4K3/2B5 w - -').isOver).toBe(false); // f5 and c1: opposite.
    expect(new Game('8/8/8/4k3/8/8/4K1N1/7n w - -').isOver).toBe(false);
    // Winning the last pawn would leave a dead draw, so taking it scores 0 for White.
    const pos = parseFen('8/8/8/8/8/1p6/1K6/7k w - -');
    const take = pos.generateLegal().find((m) => san(pos, m) === 'Kxb3') as number;
    pos.make(take);
    expect(pos.isInsufficientMaterial()).toBe(true);
  });
});

describe('threefold repetition', () => {
  // White shuffles a rook and Black a king, returning to the start position every 4 half-moves.
  const shuffle = (plies: number): Game => {
    const g = new Game('7k/8/8/8/8/8/2R5/K7 w - -');
    for (const m of ['Rd2', 'Kg8', 'Rc2', 'Kh8', 'Rd2', 'Kg8', 'Rc2', 'Kh8'].slice(0, plies)) {
      expect(g.moveText(m), m).toEqual({ ok: true });
    }
    return g;
  };
  const candidates = (g: Game, depth: number): string[] =>
    searchRoot(g.pos, depth, g.repetitionHistory()).candidates.map((m) => san(g.pos, m));

  it('ends the game on the third occurrence, not the second', () => {
    expect(shuffle(4).status.state).toBe('active');
    expect(shuffle(7).status.state).toBe('active');
    expect(shuffle(8).status).toEqual({ state: 'draw', reason: 'repetition' });
  });
  it('rejects further moves, and Undo reopens the game', () => {
    const g = shuffle(8);
    expect(g.moveText('Rd2')).toEqual({ ok: false, error: 'GameOver' });
    g.undoTurn();
    expect(g.status.state).toBe('active');
    expect(g.moveText('Kf8').ok).toBe(true);
  });
  it('a pawn move or capture resets what can repeat', () => {
    const g = new Game('7k/7p/8/8/8/8/2R5/K7 w - -');
    for (const m of ['Rd2', 'Kg8', 'Rc2', 'Kh8', 'Rd2', 'Kg8', 'Rc2', 'h6']) expect(g.moveText(m).ok, m).toBe(true);
    expect(g.repetitionHistory()).toHaveLength(1);
    expect(g.status.state).toBe('active');
  });
  it('does not count positions with different castling rights as the same', () => {
    const g = new Game('r3k3/8/8/8/8/8/8/4K2R w Kq -');
    for (const m of ['Rg1', 'Kd8', 'Rh1', 'Ke8', 'Rg1', 'Kd8', 'Rh1', 'Ke8']) expect(g.moveText(m).ok, m).toBe(true);
    // Moving rook and king gave up those rights, so the start position never recurs, and the
    // later lookalike has occurred only twice.
    expect(g.status.state).toBe('active');
  });
  it('a side that is losing takes the draw', () => {
    expect(candidates(shuffle(7), 2)).toEqual(['Kh8']);
  });
  it('a side that is winning avoids allowing it', () => {
    const list = candidates(shuffle(6), 2);
    expect(list.length).toBeGreaterThan(0);
    expect(list).not.toContain('Rc2');
  });
  it('pruning still changes only speed when repetition applies', () => {
    for (const plies of [5, 6, 7]) {
      const g = shuffle(plies);
      const history = g.repetitionHistory();
      const pruned = searchRoot(g.pos, 3, history);
      const exact = minimaxRoot(g.pos, 3, history);
      expect(pruned.value).toBe(exact.value);
      expect([...pruned.candidates].sort()).toEqual([...exact.candidates].sort());
    }
  });
  it('the engine service and worker pool pass the history through', async () => {
    const pool = new SearchPool(1);
    try {
      const g = shuffle(7);
      const info = await new EngineService(OpeningBook.empty(), pool, 2).playMove(g, true);
      expect(info.san).toBe('Kh8');
      expect(g.status).toEqual({ state: 'draw', reason: 'repetition' });
    } finally {
      await pool.close();
    }
  });
});

describe('Undo (design 7.7)', () => {
  const engine = new EngineService(OpeningBook.empty(), inlineSearcher, 1);
  it('removes the engine reply and the human move', async () => {
    const g = new Game();
    g.moveText('e4');
    await engine.playMove(g, true);
    expect(g.history).toHaveLength(2);
    expect(g.undoTurn()).toBe(true);
    expect(g.fen()).toBe(START_FEN);
  });
  it('removes just the human move when the engine has not replied', () => {
    const g = new Game();
    g.moveText('e4');
    g.undoTurn();
    expect(g.fen()).toBe(START_FEN);
  });
  it('does nothing when only the engine has moved', async () => {
    const g = new Game(undefined, BLACK);
    await engine.playMove(g, true);
    expect(g.undoTurn()).toBe(false);
    expect(g.history).toHaveLength(1);
  });
  it('does nothing at the start', () => {
    expect(new Game().undoTurn()).toBe(false);
  });
  it('treats Aid moves as the human\'s', async () => {
    const g = new Game();
    await engine.playMove(g, false);
    await engine.playMove(g, true);
    g.undoTurn();
    expect(g.fen()).toBe(START_FEN);
  });
  it('reopens a finished game', () => {
    const g = new Game('6k1/5ppp/8/8/8/8/8/R5K1 w - -');
    g.moveText('Ra8');
    expect(g.status.state).toBe('checkmate');
    g.undoTurn();
    expect(g.status.state).toBe('active');
  });
});

describe('real opening book', () => {
  const book = OpeningBook.parse(readFileSync(config.bookPath, 'utf8'));
  it('has every node except the 3 * tokens', () => {
    expect(book.nodeCount).toBe(1027018 - 3);
  });
  it('root replies are the original 12, in file order', () => {
    expect(book.lookup([])).toEqual(['e4', 'Nc3', 'd4', 'c4', 'f4', 'Nf3', 'g3', 'e3', 'c3', 'd3', 'b3', 'b4']);
  });
  it('returns nothing off the book or past the limit', () => {
    expect(book.lookup(['a4'])).toEqual([]);
    expect(book.lookup(new Array(MAX_BOOK_PLIES).fill('e4'))).toEqual([]);
  });
  it('has suffixes removed', () => {
    expect(fixPly('Qxe7+')).toBe('Qxe7');
    expect(fixPly('Qh7#')).toBe('Qh7');
    expect(fixPly('Nf3!?')).toBe('Nf3');
    expect(fixPly('e8=Q+!!')).toBe('e8=Q');
  });
  it('plays legal book moves for 20 plies from the start', async () => {
    const engine = new EngineService(book, inlineSearcher, 1);
    const g = new Game();
    const oracle = new Chess();
    for (let i = 0; i < 20 && !g.isOver; i++) {
      const before = g.history.length;
      const info = await engine.playMove(g, i % 2 === 1);
      expect(g.history.length).toBe(before + 1);
      oracle.move(info.san);
    }
    expect(g.fen().split(' ').slice(0, 3)).toEqual(oracle.fen().split(' ').slice(0, 3));
  });
  it('rejects a truncated file', () => {
    expect(() => OpeningBook.parse('2||||\n0||e4||\n')).toThrow();
  });
});

describe('worker pool', () => {
  it('runs searches in worker threads with the same result as inline', async () => {
    const pool = new SearchPool(2);
    try {
      const [a, b, c] = await Promise.all([
        pool.search(START_FEN, 2),
        pool.search(START_FEN, 2),
        pool.search(START_FEN, 2),
      ]);
      expect(a).toEqual(searchRoot(parseFen(START_FEN), 2));
      expect(b).toEqual(a);
      expect(c).toEqual(a);
    } finally {
      await pool.close();
    }
  });
});
