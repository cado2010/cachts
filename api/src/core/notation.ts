// Move input parsing, resolution and SAN output. Replaces MoveInputParser.cs and the move lookup
// in Board.cs. The grammar is the original's; resolution is stricter. See design 7.3, 7.4 and 7.6.
import type { MoveErrorCode } from '@cachts/shared';
import {
  BISHOP, KING, KNIGHT, PAWN, Position, QUEEN, ROOK, WHITE, fileOf, isCapture, isCastle, moveFrom, movePromo, moveTo,
  makePiece, rankOf, sideOf, sqFromName, sqName, typeOf, type Side,
} from './position.ts';

export interface ParsedMove {
  kind: 'move';
  type: number;
  target: number;
  startFile: number;
  startRank: number;
  isKill: boolean;
  promotion: number;
}
export type ParsedInput =
  | ParsedMove
  | { kind: 'castle'; kingSide: boolean }
  | { kind: 'draw' }
  | { kind: 'resign' };

export class ParseError extends Error {}

const TYPE_BY_LOWER: Record<string, number> = {
  k: KING, q: QUEEN, r: ROOK, n: KNIGHT,
  a: PAWN, b: PAWN, c: PAWN, d: PAWN, e: PAWN, f: PAWN, g: PAWN, h: PAWN,
};
const PROMO_BY_LOWER: Record<string, number> = { q: QUEEN, r: ROOK, b: BISHOP, n: KNIGHT };
const LETTER_BY_TYPE = ['', 'K', 'Q', 'R', 'B', 'N', ''];

/** Parses move input for the given side. Throws ParseError where the original returned InvalidFormat. */
export function parseMoveInput(side: Side, raw: string): ParsedInput {
  let input = raw.trim();
  if (input.length < 2) throw new ParseError('Movement input string has to be >= 2 chars');

  const commandLower = input.toLowerCase();
  if (commandLower === '(=)') return { kind: 'draw' };
  if (commandLower === '($)') return { kind: 'resign' };

  input = input.replace(/[+#!?]+$/, ''); // Ledger R17.
  const lower = input.toLowerCase();
  if (lower === 'o-o') return { kind: 'castle', kingSide: true };
  if (lower === 'o-o-o') return { kind: 'castle', kingSide: false };

  let body = input;
  let promotion = 0;
  if (body.length > 2 && body[body.length - 2] === '=') {
    promotion = PROMO_BY_LOWER[body[body.length - 1].toLowerCase()] ?? -1;
    if (promotion < 0) throw new ParseError(`Invalid promotion piece type in input: ${input}`);
    body = body.slice(0, -2);
  }
  if (body.length < 2 || body.length > 6) throw new ParseError(`Invalid move length: ${input}`); // Ledger R16.

  const bodyLower = body.toLowerCase();
  const parsed: ParsedMove = {
    kind: 'move', type: 0, target: -1, startFile: -1, startRank: -1, isKill: false, promotion,
  };

  if (body.length === 2) {
    parsed.type = PAWN;
  } else {
    parsed.type = body[0] === 'B' ? BISHOP : TYPE_BY_LOWER[bodyLower[0]] ?? 0;
    if (parsed.type === 0) throw new ParseError(`Invalid first char in input: ${input}`);
    if (parsed.type === PAWN) applyOption(parsed, bodyLower[0]);
    for (let i = 1; i < body.length - 2; i++) applyOption(parsed, bodyLower[i]);
  }

  parsed.target = sqFromName(bodyLower.slice(-2));
  if (parsed.target < 0) throw new ParseError(`Invalid algebraic notation: ${input}`);

  if (promotion) {
    const lastRank = side === WHITE ? 7 : 0;
    if (parsed.type !== PAWN) throw new ParseError(`Invalid promotion request - not a pawn move: ${input}`);
    if (rankOf(parsed.target) !== lastRank) {
      throw new ParseError(`Invalid promotion request - pawn not reaching Rank 8 or 1 in input: ${input}`);
    }
  } else if (parsed.type === PAWN && (rankOf(parsed.target) === 0 || rankOf(parsed.target) === 7)) {
    throw new ParseError(`Pawn cannot reach Rank 8 or 1 without promoting, input: ${input}`);
  }
  return parsed;
}

function applyOption(parsed: ParsedMove, c: string): void {
  if (c === 'x') {
    parsed.isKill = true;
  } else if (c >= '0' && c <= '9') {
    const rank = c.charCodeAt(0) - 49;
    if (rank < 0 || rank > 7) throw new ParseError(`Invalid Rank in algebraic notation: ${c}`);
    parsed.startRank = rank;
  } else if (c >= 'a' && c <= 'z') {
    const file = c.charCodeAt(0) - 97;
    if (file > 7) throw new ParseError(`Invalid File in algebraic notation: ${c}`);
    parsed.startFile = file;
  }
  // Any other character is ignored, as in the original SetOptions.
}

export type Resolution = { ok: true; move: number } | { ok: false; error: MoveErrorCode };
const fail = (error: MoveErrorCode): Resolution => ({ ok: false, error });

/** Applies the checks in design section 7.4, in that order. */
export function resolveParsed(pos: Position, parsed: ParsedInput): Resolution {
  if (parsed.kind === 'castle') {
    const kingTarget = (pos.side === WHITE ? 4 : 60) + (parsed.kingSide ? 2 : -2);
    const move = pos.generatePseudo().find((m) => isCastle(m) && moveTo(m) === kingTarget);
    return move !== undefined && pos.isLegal(move) ? { ok: true, move } : fail('InvalidCastle');
  }
  if (parsed.kind !== 'move') return fail('InvalidFormat');

  const wanted = makePiece(parsed.type, pos.side);
  const matchesHints = (sq: number): boolean =>
    pos.board[sq] === wanted
    && (parsed.startFile < 0 || fileOf(sq) === parsed.startFile)
    && (parsed.startRank < 0 || rankOf(sq) === parsed.startRank);

  let hasPiece = false;
  for (let sq = 0; sq < 64 && !hasPiece; sq++) hasPiece = matchesHints(sq);
  if (!hasPiece) return fail('NoSuchPiece');

  const reach = pos.generatePseudo().filter((m) =>
    !isCastle(m) && moveTo(m) === parsed.target && movePromo(m) === parsed.promotion && matchesHints(moveFrom(m)));
  if (reach.length === 0) return fail('NoPieceInRange');

  const legal = reach.filter((m) => pos.isLegal(m));
  if (legal.length > 1) return fail('MoreThanOnePieceInRange');
  if (parsed.isKill && !(legal.length ? legal : reach).some(isCapture)) return fail('InvalidKill');
  if (legal.length === 0) return fail('KingInCheck');
  return { ok: true, move: legal[0] };
}

/** Resolves a board click, including the king-moves-two-squares castling gesture. */
export function resolveClick(pos: Position, from: number, to: number, promotion: number): Resolution {
  const piece = pos.board[from];
  if (piece === 0 || sideOf(piece) !== pos.side) return fail('NoSuchPiece');

  const isPawn = typeOf(piece) === PAWN;
  const reachesLastRank = isPawn && rankOf(to) === (pos.side === WHITE ? 7 : 0);
  if (reachesLastRank !== (promotion !== 0)) return fail('InvalidFormat');

  const reach = pos.generatePseudo().filter((m) =>
    moveFrom(m) === from && moveTo(m) === to && movePromo(m) === promotion);
  if (reach.length === 0) {
    const isCastleAttempt = typeOf(piece) === KING && fileOf(from) === 4 && rankOf(from) === rankOf(to)
      && Math.abs(fileOf(to) - fileOf(from)) === 2;
    return fail(isCastleAttempt ? 'InvalidCastle' : 'NoPieceInRange');
  }
  return pos.isLegal(reach[0]) ? { ok: true, move: reach[0] } : fail('KingInCheck');
}

/** Canonical SAN without a check or mate suffix. Disambiguates using legal moves only. */
export function sanBase(pos: Position, move: number, legal: number[] = pos.generateLegal()): string {
  if (isCastle(move)) return moveTo(move) > moveFrom(move) ? 'O-O' : 'O-O-O';
  const from = moveFrom(move);
  const to = moveTo(move);
  const type = typeOf(pos.board[from]);
  const capture = isCapture(move) ? 'x' : '';
  let san: string;
  if (type === PAWN) {
    san = (capture ? String.fromCharCode(97 + fileOf(from)) + 'x' : '') + sqName(to);
    if (movePromo(move)) san += '=' + LETTER_BY_TYPE[movePromo(move)];
    return san;
  }
  const rivals = legal.filter((m) =>
    moveTo(m) === to && moveFrom(m) !== from && typeOf(pos.board[moveFrom(m)]) === type);
  let hint = '';
  if (rivals.length > 0) {
    const sameFile = rivals.some((m) => fileOf(moveFrom(m)) === fileOf(from));
    const sameRank = rivals.some((m) => rankOf(moveFrom(m)) === rankOf(from));
    const fileName = String.fromCharCode(97 + fileOf(from));
    if (!sameFile) hint = fileName;
    else if (!sameRank) hint = String(rankOf(from) + 1);
    else hint = sqName(from);
  }
  return LETTER_BY_TYPE[type] + hint + capture + sqName(to);
}

/** Full SAN including + or #. The position is unchanged afterwards. */
export function san(pos: Position, move: number, legal?: number[]): string {
  const base = sanBase(pos, move, legal);
  pos.make(move);
  let suffix = '';
  if (pos.inCheck(pos.side)) suffix = pos.hasLegalMove() ? '+' : '#';
  pos.unmake(move);
  return base + suffix;
}

