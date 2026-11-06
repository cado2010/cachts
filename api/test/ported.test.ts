// Ported from the C# NUnit suites in cachCoreTests and cacheEngineTests, same names where practical.
// Positions changed from the originals, and why:
//  - "[R12]": the original FEN had a missing king or the side not to move in check, which is now
//    rejected. A king was added or moved without affecting what the test checks.
//  - "[R9]": the original ignored the FEN side to move or castling field, so the test now states them.
import { describe, expect, it } from 'vitest';
import { parseFen, START_FEN, toFen } from '../src/core/fen.ts';
import { Game } from '../src/core/game.ts';
import { parseMoveInput, ParseError, resolveParsed, type ParsedMove } from '../src/core/notation.ts';
import { parsePgnPlies } from '../src/core/pgn.ts';
import {
  BISHOP, BLACK, KING, KNIGHT, PAWN, QUEEN, ROOK, WHITE, makePiece, moveTo, sqFromName, type Side,
} from '../src/core/position.ts';

const asSide = (fen: string, side: Side): string =>
  fen.replace(/ [wb] /, side === WHITE ? ' w ' : ' b ');
const parsedMove = (side: Side, text: string): ParsedMove => parseMoveInput(side, text) as ParsedMove;

describe('MoveInputParserTests', () => {
  it('Qe4 is a queen, not a kill', () => {
    const md = parsedMove(BLACK, 'Qe4');
    expect(md.type).toBe(QUEEN);
    expect(md.isKill).toBe(false);
    expect(md.target).toBe(sqFromName('e4'));
  });
  it('Qxa1 is a queen kill', () => {
    const md = parsedMove(BLACK, 'Qxa1');
    expect(md.type).toBe(QUEEN);
    expect(md.isKill).toBe(true);
    expect(md.target).toBe(sqFromName('a1'));
  });
  it('Nfh8 is not a queen', () => {
    const md = parsedMove(BLACK, 'Nfh8');
    expect(md.type).not.toBe(QUEEN);
    expect(md.target).toBe(sqFromName('h8'));
  });
  it('Nfh2 has a start file', () => {
    const md = parsedMove(BLACK, 'Nfh2');
    expect(md).toMatchObject({ type: KNIGHT, target: sqFromName('h2'), startFile: 5, startRank: -1 });
  });
  it('N4h2 has a start rank', () => {
    const md = parsedMove(BLACK, 'N4h2');
    expect(md).toMatchObject({ type: KNIGHT, target: sqFromName('h2'), startFile: -1, startRank: 3 });
  });
  it('Ba1 is a bishop', () => {
    expect(parsedMove(BLACK, 'Ba1')).toMatchObject({ type: BISHOP, target: 0, startFile: -1, startRank: -1 });
  });
  it('ba1=R is a pawn from the b file promoting to a rook', () => {
    expect(parsedMove(BLACK, 'ba1=R')).toMatchObject({
      type: PAWN, promotion: ROOK, target: 0, startFile: 1, startRank: -1,
    });
  });
  it('e4 is a pawn', () => {
    expect(parsedMove(BLACK, 'e4')).toMatchObject({ type: PAWN, target: sqFromName('e4'), startFile: -1 });
  });
  it('o-o is king side castle', () => {
    expect(parseMoveInput(BLACK, 'o-o')).toEqual({ kind: 'castle', kingSide: true });
  });
  it('o-o-o is queen side castle', () => {
    expect(parseMoveInput(BLACK, 'o-o-o')).toEqual({ kind: 'castle', kingSide: false });
  });
  it('exf5 is a pawn kill', () => {
    expect(parsedMove(BLACK, 'exf5')).toMatchObject({
      type: PAWN, isKill: true, target: sqFromName('f5'), startFile: 4, startRank: -1,
    });
  });
  it('Ra1xa8 is a rook kill with a full start', () => {
    expect(parsedMove(BLACK, 'Ra1xa8')).toMatchObject({
      type: ROOK, isKill: true, target: sqFromName('a8'), startFile: 0, startRank: 0,
    });
  });
  it('Ra1d1 is a rook move with a full start', () => {
    expect(parsedMove(WHITE, 'Ra1d1')).toMatchObject({
      type: ROOK, isKill: false, target: sqFromName('d1'), startFile: 0, startRank: 0,
    });
  });
  it('Kf5 is a king', () => {
    expect(parsedMove(BLACK, 'Kf5')).toMatchObject({ type: KING, isKill: false, startFile: -1, startRank: -1 });
  });
  it.each<[Side, string, number]>([
    [BLACK, 'e1=Q', QUEEN], [WHITE, 'e8=Q', QUEEN], [BLACK, 'e1=N', KNIGHT], [WHITE, 'a8=B', BISHOP], [WHITE, 'g8=r', ROOK],
  ])('promotion succeeds: %s %s', (side, text, promotion) => {
    expect(parsedMove(side, text)).toMatchObject({ type: PAWN, promotion });
  });
  it.each<[Side, string]>([
    [WHITE, 'e7=Q'], [WHITE, 'e1=Q'], [BLACK, 'e7=Q'], [BLACK, 'e8=Q'], [BLACK, 'e1=K'], [BLACK, 'e1=p'],
  ])('promotion fails: %s %s', (side, text) => {
    expect(() => parseMoveInput(side, text)).toThrow(ParseError);
  });
  it('promotion returns the requested piece type', () => {
    expect(parsedMove(BLACK, 'e1=Q').promotion).not.toBe(ROOK);
  });
});

describe('BoardMoveTests', () => {
  const start = (side: Side): Game => new Game(asSide(START_FEN, side));
  it('white e4 succeeds', () => expect(start(WHITE).moveText('e4')).toEqual({ ok: true }));
  it('white e5 fails', () => expect(start(WHITE).moveText('e5').ok).toBe(false));
  it('black c5 succeeds', () => expect(start(BLACK).moveText('c5')).toEqual({ ok: true }));
  it('white c5 fails', () => expect(start(WHITE).moveText('c5').ok).toBe(false));
  it('white Nc3 succeeds', () => expect(start(WHITE).moveText('Nc3')).toEqual({ ok: true }));
  it('white Nc2 fails', () => expect(start(WHITE).moveText('Nc2').ok).toBe(false));
  it('two knights can reach: correct code', () => {
    // [R12] kings added.
    const g = new Game('4k3/8/8/8/8/3N4/8/3N2K1 w - -');
    expect(g.moveText('Nf2')).toEqual({ ok: false, error: 'MoreThanOnePieceInRange' });
  });
  it('all queen moves fail from the start', () => {
    for (const m of ['Qd3', 'Qd4', 'Qa4', 'Qa1']) expect(start(WHITE).moveText(m).ok).toBe(false);
    for (const m of ['Qd3', 'Qd4']) expect(start(BLACK).moveText(m).ok).toBe(false);
  });
  it('configured queen moves 1', () => {
    const g = new Game('3k4/8/8/8/4PP2/4Q3/8/3K4 w - -');
    expect(g.moveText('Qe5').ok).toBe(false);
    expect(g.moveText('Qg5').ok).toBe(false);
    expect(g.moveText('Qc5').ok).toBe(true);
  });
  it('configured queen moves 2: capture with and without x', () => {
    expect(new Game('3k4/8/8/2b5/4PP2/4Q3/8/3K4 w - -').moveText('Qc5').ok).toBe(true);
    expect(new Game('3k4/8/8/2b5/4PP2/4Q3/8/3K4 w - -').moveText('Qxc5').ok).toBe(true);
  });
  it('in-check move not allowed 1', () => {
    expect(new Game('3k4/8/8/2b5/4PP2/4Q2p/6K1/8 w - -').moveText('Qc5'))
      .toEqual({ ok: false, error: 'KingInCheck' });
  });
  it('in-check move not allowed 2', () => {
    expect(new Game('3k4/8/8/8/4PP2/3pQ3/4K3/8 w - -').moveText('Qc5'))
      .toEqual({ ok: false, error: 'KingInCheck' });
  });
  it('in-check move allowed by capture', () => {
    expect(new Game('3k4/8/8/8/4PP2/3pQ3/4K3/8 w - -').moveText('Qxd3').ok).toBe(true);
  });
  it('pawn x pawn', () => {
    const g = new Game('2k5/8/8/8/3p4/8/2P5/5K2 w - -');
    expect(g.moveText('c3').ok).toBe(true);
    expect(g.moveText('dxc3').ok).toBe(true);
  });
  it('en passant 1', () => {
    const g = new Game('2k5/8/8/8/3p4/8/2P5/5K2 w - -');
    expect(g.moveText('c4').ok).toBe(true);
    expect(g.moveText('dxc3').ok).toBe(true);
  });
  it('en passant 2', () => {
    const g = new Game('2k5/3p4/8/2P5/8/8/8/5K2 b - -'); // [R9] black to move.
    expect(g.moveText('d5').ok).toBe(true);
    expect(g.moveText('cxd6').ok).toBe(true);
  });
  it('king move next to the enemy king fails', () => {
    expect(new Game('8/7P/8/8/8/8/7R/k1K5 w - -').moveText('Kb1').ok).toBe(false);
  });
  it.each(['3k4/8/8/8/8/P7/P7/K7 w - -', '3k4/8/8/8/8/8/P7/K7 w - -'])('pawn move succeeds: %s', (fen) => {
    expect(new Game(fen).moveText('a4').ok).toBe(true);
  });
  it.each([
    ['3k4/8/8/8/8/B7/P7/K7 w - -', 'a4'], ['3k4/8/8/8/8/b7/P7/K7 w - -', 'a4'], ['3k4/8/8/8/8/8/2p5/7K b - -', 'c1'],
  ])('pawn move fails: %s %s', (fen, move) => {
    expect(new Game(fen).moveText(move).ok).toBe(false);
  });
  it('pawn promotion succeeds and is recorded', () => {
    const g = new Game('3k4/8/8/8/8/8/2p5/7K b - -');
    expect(g.moveText('c1=Q').ok).toBe(true);
    expect(g.history[0].bookPly).toBe('c1=Q');
  });
});

describe('InMateHelperTests', () => {
  // [R9] sides stated. [R12] black king moved from f8 to g8 where the white bishop on b4 would check it.
  it.each<[string, Side]>([
    ['8/8/8/8/8/k7/1Q5R/2K5 w - -', BLACK],
    ['2r2k2/8/8/3q4/8/8/4R3/3KN3 w - -', WHITE],
    ['2r3k1/8/8/3q4/1B6/8/4P3/3KN3 w - -', WHITE],
    ['2r3k1/8/8/3q4/1B6/1B6/4P3/3KN3 w - -', WHITE],
    ['2r2k2/8/8/B2q4/8/8/4P3/3KN3 w - -', WHITE],
    ['2r2k2/8/8/B2q4/1P6/5N2/4P3/3KR3 w - -', WHITE],
    ['2r2k2/8/8/3q4/8/8/4P3/rNRKR3 w - -', WHITE],
  ])('not in mate: %s', (fen, side) => {
    expect(new Game(asSide(fen, side)).status.state).not.toBe('checkmate');
  });
  it.each<[string, Side]>([
    ['7Q/8/8/8/8/8/7R/k1K5 w - -', BLACK],
    ['2r2k2/8/8/B2q4/1P6/8/4P3/3KR3 w - -', WHITE],
    ['2r2k2/8/8/3q4/b7/1N6/4P3/3KR3 w - -', WHITE],
    ['2r2k2/8/8/3q4/8/8/4P3/rN1KR3 w - -', WHITE],
  ])('in mate: %s', (fen, side) => {
    expect(new Game(asSide(fen, side)).status.state).toBe('checkmate');
  });
});

describe('InCheckHelperTests', () => {
  it.each<[string, Side]>([
    ['3q3k/3p4/8/8/8/3P4/8/3K4 w - -', WHITE], // [R12] black king added.
    ['3q3k/8/8/8/8/3P4/8/3K4 w - -', WHITE], // [R12] black king added.
    ['3k4/8/8/3P4/8/8/8/3QK3 b - -', BLACK],
    ['7Q/8/8/8/8/8/k7/2K4R b - -', BLACK],
    ['6k1/5ppp/8/2p5/1p5P/r2P4/1K6/r7 w - -', WHITE],
  ])('not in check: %s', (fen, side) => {
    expect(parseFen(fen).inCheck(side)).toBe(false);
  });
  // The original's last two cases used adjacent kings, an impossible position now rejected by R12.
  it.each<[string, Side]>([
    ['3k4/8/8/8/8/8/8/3QK3 b - -', BLACK],
    ['3k4/8/8/3P4/7B/8/8/3QK3 b - -', BLACK],
  ])('in check: %s', (fen, side) => {
    expect(parseFen(fen).inCheck(side)).toBe(true);
  });
  it('adjacent kings are rejected as a position', () => {
    expect(() => parseFen('8/7P/8/8/8/8/7R/kK6 w - -')).toThrow();
  });
});

describe('CastleAttemptValidationHelperTests', () => {
  // [R9] the K right is now stated, because the original inferred it from "never moved".
  const castle = (fen: string) => {
    const pos = parseFen(fen);
    return resolveParsed(pos, { kind: 'castle', kingSide: true });
  };
  it('through an attacked square fails', () => {
    expect(castle('8/8/1k6/1b6/8/8/5PPP/4K2R w K -').ok).toBe(false);
  });
  it('succeeds and places king and rook', () => {
    const fen = '8/8/1k6/1b6/6R1/8/4PP1P/4K2R w K -';
    const result = castle(fen);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(moveTo(result.move)).toBe(sqFromName('g1'));
    const pos = parseFen(fen);
    pos.make(result.move);
    expect(pos.board[sqFromName('f1')]).toBe(makePiece(ROOK, WHITE));
  });
  it('into an attacked square fails', () => {
    expect(castle('8/8/1k6/1b6/6r1/8/4PP1P/4K2R w K -').ok).toBe(false);
  });
  it('without a rook fails', () => {
    expect(castle('8/8/1k6/1b6/8/8/4PP1P/4K3 w K -').ok).toBe(false);
  });
});

describe('FENSerializerTests and BoardInitTests', () => {
  const start = parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
  const at = (name: string): number => start.board[sqFromName(name)];
  it('piece colours and empty squares', () => {
    expect(at('a1')).toBe(makePiece(ROOK, WHITE));
    expect(at('a2')).toBe(makePiece(PAWN, WHITE));
    expect(at('h2')).toBe(makePiece(PAWN, WHITE));
    expect(at('a7')).toBe(makePiece(PAWN, BLACK));
    expect(at('h8')).toBe(makePiece(ROOK, BLACK));
    for (const name of ['c3', 'd4', 'e5', 'f6']) expect(at(name)).toBe(0);
    expect(at('g7')).not.toBe(0);
  });
  it.each<[string, Side]>([['black', BLACK], ['white', WHITE]])('%s piece types', (_n, side) => {
    const rank = side === WHITE ? 0 : 7;
    const pawnRank = side === WHITE ? 1 : 6;
    const back = [ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK];
    back.forEach((type, file) => expect(start.board[rank * 8 + file]).toBe(makePiece(type, side)));
    for (let file = 0; file < 8; file++) expect(start.board[pawnRank * 8 + file]).toBe(makePiece(PAWN, side));
  });
  it('new game matches the standard start', () => {
    expect(new Game().fen()).toBe(START_FEN);
    expect(toFen(start)).toBe(START_FEN);
  });
  it('specific FEN 1', () => {
    const p = parseFen('8/8/8/3k4/3Q4/3K4/8/8 b - -'); // [R12] Black is in check, so Black must be to move.
    expect(p.board[sqFromName('d3')]).toBe(makePiece(KING, WHITE));
    expect(p.board[sqFromName('d4')]).toBe(makePiece(QUEEN, WHITE));
    expect(p.board[sqFromName('d5')]).toBe(makePiece(KING, BLACK));
  });
  it('specific FEN 2', () => {
    const p = parseFen('8/8/8/3k4/3n1r2/8/5K2/8 w - -');
    expect(p.board[sqFromName('f2')]).toBe(makePiece(KING, WHITE));
    expect(p.board[sqFromName('f3')]).toBe(0);
    expect(p.board[sqFromName('f4')]).toBe(makePiece(ROOK, BLACK));
    expect(p.board[sqFromName('d4')]).toBe(makePiece(KNIGHT, BLACK));
    expect(p.board[sqFromName('d5')]).toBe(makePiece(KING, BLACK));
  });
});

describe('PieceTests', () => {
  const targets = (fen: string): string[] => parseFen(fen).generateLegal().map((m) => moveTo(m)).sort((a, b) => a - b)
    .map(String);
  it('king movement from a corner', () => {
    expect(targets('7K/8/8/8/8/8/8/k7 b - -').map(Number)).toEqual([1, 8, 9]);
  });
  it('king movement from b2', () => {
    expect(targets('7K/8/8/8/8/8/1k6/8 b - -').map(Number)).toEqual([0, 1, 2, 8, 10, 16, 17, 18]);
  });
});

describe('PGNParserTests', () => {
  it.each<[string, string[]]>([
    ['1. e4 e5 2. Nf3', ['e4', 'e5', 'Nf3']],
    ['1. d4 Nf6 2. Nc3 g6 \n3. e4 h5 4. h3 ', ['d4', 'Nf6', 'Nc3', 'g6', 'e4', 'h5', 'h3']],
  ])('pgn: %s', (pgn, plies) => {
    expect(parsePgnPlies(pgn)).toEqual(plies);
  });
  it('compact numbering and a result token', () => {
    expect(parsePgnPlies('1.d4 Nf6 2.c4 e6 3.Nf3 Bb4+ 4.Bd2 a5 5.Nc3 b6 6.e3 Bb7 7.Bd3 d6 8.Qe2 0-1')).toEqual(
      ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'Bb4+', 'Bd2', 'a5', 'Nc3', 'b6', 'e3', 'Bb7', 'Bd3', 'd6', 'Qe2'],
    );
  });
  it.each(['1-0', '0-1', '1/2-1/2'])('strips the result %s', (result) => {
    expect(parsePgnPlies(`1.e4 e5 2.Nf3 ${result}`)).toEqual(['e4', 'e5', 'Nf3']);
  });
  it('rejects a wrong move number', () => {
    expect(() => parsePgnPlies('1. e4 e5 3. Nf3')).toThrow();
  });
});
