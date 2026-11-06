// One regression test per rules and engine ID in the design's bug ledger (section 4).
// UI IDs are covered in web/test and e2e/.
import { describe, expect, it } from 'vitest';
import { OpeningBook } from '../src/book/openingBook.ts';
import { parseFen, START_FEN } from '../src/core/fen.ts';
import { Game } from '../src/core/game.ts';
import { san } from '../src/core/notation.ts';
import { BLACK, WHITE, isCapture, isCastle, moveFrom, moveTo, sqFromName, sqName } from '../src/core/position.ts';
import { EngineService } from '../src/engine/engineService.ts';
import { isEndGame, terminalValue } from '../src/engine/evaluator.ts';
import { applyPreferences } from '../src/engine/filter.ts';
import { minimaxRoot, searchRoot } from '../src/engine/search.ts';
import type { Searcher } from '../src/engine/searchPool.ts';

const inlineSearcher: Searcher = {
  search: async (fen, depth) => searchRoot(parseFen(fen), depth),
  close: async () => {},
};
const play = (g: Game, ...moves: string[]): void => {
  for (const m of moves) expect(g.moveText(m), m).toEqual({ ok: true });
};
const sans = (fen: string, depth: number): string[] => {
  const pos = parseFen(fen);
  return searchRoot(pos, depth).candidates.map((m) => san(pos, m));
};

describe('rules ledger', () => {
  it('R1 en passant removes the captured pawn', () => {
    const g = new Game();
    play(g, 'e4', 'a6', 'e5', 'd5', 'exd6');
    expect(g.pos.board[sqFromName('d5')]).toBe(0);
    expect(g.fen().split(' ')[0]).toBe('rnbqkbnr/1pp1pppp/p2P4/8/8/8/PPPP1PPP/RNBQKBNR');
  });
  it('R2 stalemate is only judged for the side to move', () => {
    const g = new Game('k7/8/p7/8/P7/8/5q2/7K w - -');
    play(g, 'a5');
    expect(g.status.state).toBe('active');
    expect(g.pos.side).toBe(BLACK);
  });
  it('R3 a pinned capturer does not prevent checkmate', () => {
    const g = new Game('6k1/6pp/8/3b2N1/8/R7/B7/6K1 w - -');
    play(g, 'Ra8');
    expect(g.status).toEqual({ state: 'checkmate', winner: 'white' });
    expect(g.pos.generateLegal()).toEqual([]);
  });
  it('R4 a pinned piece does not prevent stalemate', () => {
    expect(new Game('7K/8/8/8/8/1Q6/8/kn5R b - -').status.state).toBe('stalemate');
  });
  it('R5 capturing one attacker does not answer a double check', () => {
    // Knight and rook both check. fxg6 would capture the knight, but the rook still gives check.
    const g = new Game('6rk/5pp1/8/8/7N/8/8/K6R w - -');
    play(g, 'Ng6');
    expect(g.pos.inCheck(BLACK)).toBe(true);
    expect(g.status).toEqual({ state: 'checkmate', winner: 'white' });
  });
  it('R6 a full-square move cannot move the opponent\'s piece or misname a piece', () => {
    const g = new Game();
    play(g, 'e4');
    expect(g.moveText('Ng1f3')).toEqual({ ok: false, error: 'NoSuchPiece' });
    const h = new Game();
    expect(h.moveText('Qe2e4')).toEqual({ ok: false, error: 'NoSuchPiece' });
  });
  it('R7 a full-square move from an empty square is an error, not a crash', () => {
    expect(new Game().moveText('Qd4d5')).toEqual({ ok: false, error: 'NoSuchPiece' });
  });
  it.each(['O-O', 'o-o'])('R8 %s counts as castled', (text) => {
    const g = new Game('r3k2r/8/8/8/8/8/8/R3K2R w KQkq -');
    play(g, text);
    expect(g.hasCastled(WHITE)).toBe(true);
    expect(g.pgnList()).toEqual(['1. O-O']);
  });
  it('R9 FEN side to move, castling rights and en passant are honoured', () => {
    expect(new Game('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3').pos.side).toBe(BLACK);
    expect(new Game('4k3/8/8/8/8/8/8/4K2R w - -').moveText('O-O')).toEqual({ ok: false, error: 'InvalidCastle' });
    expect(new Game('4k3/8/8/3pP3/8/8/8/4K3 w - d6').moveText('exd6').ok).toBe(true);
    expect(new Game('4k3/8/8/3pP3/8/8/8/4K3 w - -').moveText('exd6').ok).toBe(false);
  });
  it('R10 FEN export is complete and reports rights, not momentary ability', () => {
    expect(new Game().fen()).toBe(START_FEN);
    const g = new Game();
    play(g, 'e4');
    expect(g.fen()).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
  });
  it('R11 castling requires king and rook on their home squares', () => {
    expect(new Game('4k3/8/8/8/8/8/8/3K3R w KQ -').moveText('o-o')).toEqual({ ok: false, error: 'InvalidCastle' });
    expect(new Game('4k3/8/8/8/8/8/8/3K3R w').moveText('o-o')).toEqual({ ok: false, error: 'InvalidCastle' });
  });
  it.each([
    ['no kings', '8/8/8/8/8/8/8/RK6 w - -'],
    ['two white kings', '4k3/8/8/8/8/8/8/KK6 w - -'],
    ['pawn on rank 1', '4k3/8/8/8/8/8/8/P3K3 w - -'],
    ['side not to move in check', '4k3/8/8/8/8/8/4R3/4K3 w - -'],
    ['too few ranks', '4k3/8/8/8/4K3 w - -'],
    ['too many squares', '4k4/8/8/8/8/8/8/4K3 w - -'],
    ['unknown piece', '4k3/8/8/8/8/8/8/4K2X w - -'],
  ])('R12 rejects %s', (_name, fen) => {
    expect(() => parseFen(fen)).toThrow();
  });
  it('R13 castling clears the en passant square', () => {
    const g = new Game('r3k3/8/8/8/4p3/8/3P4/4K2R w Kq -');
    play(g, 'd4', 'O-O-O');
    expect(g.pos.ep).toBe(-1);
    play(g, 'O-O');
    expect(g.moveText('exd3')).toEqual({ ok: false, error: 'NoPieceInRange' });
  });
  it('R14 undoing a promotion restores the en passant square and everything else', () => {
    const fen = 'r3k3/1P6/8/3pP3/8/8/8/4K3 w q d6 0 5';
    const g = new Game(fen);
    expect(g.fen()).toBe(fen);
    play(g, 'bxa8=Q');
    expect(g.undoTurn()).toBe(true);
    expect(g.fen()).toBe(fen);
    expect(g.moveText('exd6').ok).toBe(true);
  });
  it.each(['($)', '(=)'])('R15 undo clears the result of %s without removing a move', (command) => {
    const g = new Game();
    play(g, 'e4', command);
    expect(g.isOver).toBe(true);
    expect(g.undoTurn()).toBe(true);
    expect(g.isOver).toBe(false);
    expect(g.history).toHaveLength(1);
  });
  it('R16 over-long input is rejected rather than truncated', () => {
    expect(new Game().moveText('Nb1xc3xx')).toEqual({ ok: false, error: 'InvalidFormat' });
  });
  it.each(['Nf3+', 'Nf3#', 'Nf3!', 'Nf3?!'])('R17 accepts the suffix on %s', (text) => {
    expect(new Game().moveText(text).ok).toBe(true);
  });
  it('R18 the move list numbers a black-to-move start correctly', () => {
    const g = new Game('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 7');
    play(g, 'e5', 'Nf3', 'Nc6');
    expect(g.pgnList()).toEqual(['7... e5', '8. Nf3 Nc6']);
  });
});

describe('engine ledger', () => {
  it('E1 the engine playing White promotes', () => {
    const list = sans('8/P6k/8/8/8/8/8/K7 w - -', 4);
    expect(list.every((s) => s.startsWith('a8=Q'))).toBe(true);
  });
  it('E2 the opponent promotes in search', () => {
    // If White could not promote in search, Black would see only a pawn up for White here.
    const pos = parseFen('7k/P7/8/8/8/8/8/K7 b - -');
    expect(searchRoot(pos, 2).value).toBeLessThan(-800);
  });
  it('E3 searching twice gives the same candidates', () => {
    const pos = parseFen(START_FEN);
    const first = searchRoot(pos, 3).candidates;
    expect(searchRoot(pos, 3).candidates).toEqual(first);
    expect(pos.generateLegal()).toEqual(parseFen(START_FEN).generateLegal());
  });
  it.each([
    [START_FEN, 4],
    ['r1bqkb1r/pp3ppp/2n1pn2/2pp4/3P4/2N1PN2/PPP1BPPP/R1BQK2R b KQkq - 0 1', 3],
    ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 3],
    ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 4],
    ['8/8/8/8/8/4k3/8/4K2R b - - 0 1', 4],
    ['6rk/5pp1/8/8/7N/8/8/K6R w - - 0 1', 4],
  ])('E4 E10 pruning changes only speed: exact value and tie set for %s', (fen, depth) => {
    const pruned = searchRoot(parseFen(fen), depth);
    const exact = minimaxRoot(parseFen(fen), depth);
    expect(pruned.value).toBe(exact.value);
    expect([...pruned.candidates].sort()).toEqual([...exact.candidates].sort());
  });
  it('E5 the endgame test can become true', () => {
    expect(isEndGame(parseFen(START_FEN))).toBe(false);
    expect(isEndGame(parseFen('4k2r/8/8/8/8/8/8/4K2R w - -'))).toBe(true);
  });
  it('E6 stalemate scores as a draw and a winning engine avoids it', () => {
    const stalemate = parseFen('7k/5K2/6Q1/8/8/8/8/8 b - -');
    expect(terminalValue(stalemate, WHITE, 2)).toBe(0);
    expect(sans('7k/5K2/8/6Q1/8/8/8/8 w - -', 3)).not.toContain('Qg6');
  });
  it('E7 search includes opponent castling', () => {
    // Records the moves search actually plays. The first root move has a full window, so nothing
    // prunes White's replies, including castling, which is ordered last.
    const pos = parseFen('5k2/8/8/8/8/8/8/4K2R b K -');
    const played: number[] = [];
    const make = pos.make.bind(pos);
    pos.make = (m: number): void => {
      if (pos.side === WHITE) played.push(m);
      make(m);
    };
    searchRoot(pos, 2);
    expect(played.some(isCastle)).toBe(true);
  });
  it('E8 en passant counts as a capture', () => {
    const pos = parseFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6');
    const ep = pos.generateLegal().find((m) => sqName(moveTo(m)) === 'd6');
    expect(ep).toBeDefined();
    expect(isCapture(ep as number)).toBe(true);
  });
  it('E9 a filtered capture does not bring back every tied move', () => {
    const g = new Game('4k3/8/8/8/8/3p4/4P3/4K3 w - -');
    const legal = g.pos.generateLegal();
    const kingCapture = legal.find((m) => moveFrom(m) === sqFromName('e1') && moveTo(m) === sqFromName('d2'));
    const pawnCapture = legal.find((m) => moveFrom(m) === sqFromName('e2') && moveTo(m) === sqFromName('d3'))!;
    const pawnPush = legal.find((m) => moveFrom(m) === sqFromName('e2') && moveTo(m) === sqFromName('e3'))!;
    expect(kingCapture).toBeDefined();
    expect(applyPreferences(g, [pawnCapture, pawnPush])).toEqual([pawnCapture]);

    const middle = new Game();
    play(middle, 'e4', 'd5');
    const m = middle.pos.generateLegal();
    const queenMove = m.find((x) => moveFrom(x) === sqFromName('d1'))!;
    const pawnMove = m.find((x) => moveFrom(x) === sqFromName('a2'))!;
    expect(applyPreferences(middle, [queenMove, pawnMove])).toEqual([pawnMove]);
  });
  it('E11 E12 only legal book moves are offered', async () => {
    // "Nf6" is illegal for White at the start and "*" is a PGN token, not a move.
    const book = OpeningBook.parse('3||||\n0||Nf6||\n0||*||\n0||e4||\n');
    expect(book.lookup([])).toEqual(['Nf6', 'e4']);
    const g = new Game();
    const info = await new EngineService(book, inlineSearcher, 1).playMove(g, true);
    expect(info).toMatchObject({ source: 'book', san: 'e4', candidates: 1 });
  });
  it('E13 book matching uses canonical notation, not the text typed', () => {
    const g = new Game();
    play(g, 'Nb1c3', 'D5', 'e4');
    expect(g.bookPlies).toEqual(['Nc3', 'd5', 'e4']);
  });
  it('E14 the book is not used on custom FEN boards', async () => {
    const book = OpeningBook.parse('1||||\n0||Kd2||\n');
    const g = new Game('4k3/8/8/8/8/8/4P3/4K3 w - -');
    const info = await new EngineService(book, inlineSearcher, 1).playMove(g, true);
    expect(info.source).toBe('search');
  });
});
