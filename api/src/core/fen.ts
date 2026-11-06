// FEN import and export, replacing cachCore/utils/FENSerializer.cs. See design section 7.2.
import {
  BK, BLACK, BQ, KING, Position, WHITE, WK, WQ, makePiece, other, rankOf, sideOf, sqFromName, sqName, typeOf,
  BISHOP, KNIGHT, PAWN, QUEEN, ROOK,
} from './position.ts';

export { START_FEN } from '@cachts/shared';

export class FenError extends Error {}

const TYPE_BY_LETTER: Record<string, number> = { k: KING, q: QUEEN, r: ROOK, b: BISHOP, n: KNIGHT, p: PAWN };
const LETTER_BY_TYPE = ['', 'k', 'q', 'r', 'b', 'n', 'p'];

function parsePlacement(pos: Position, placement: string): void {
  const ranks = placement.split('/');
  if (ranks.length !== 8) throw new FenError(`expected 8 ranks, found ${ranks.length}`);
  const kings = [0, 0];
  ranks.forEach((text, i) => {
    const rank = 7 - i;
    let file = 0;
    for (const c of text) {
      if (c >= '1' && c <= '8') {
        file += Number(c);
      } else {
        const type = TYPE_BY_LETTER[c.toLowerCase()];
        if (type === undefined) throw new FenError(`unknown piece '${c}'`);
        if (file > 7) throw new FenError(`rank ${rank + 1} has more than 8 squares`);
        const side = c === c.toUpperCase() ? WHITE : BLACK;
        if (type === PAWN && (rank === 0 || rank === 7)) throw new FenError('pawn on rank 1 or 8');
        pos.board[rank * 8 + file] = makePiece(type, side);
        if (type === KING) {
          kings[side]++;
          pos.kingSq[side] = rank * 8 + file;
        }
        file++;
      }
    }
    if (file !== 8) throw new FenError(`rank ${rank + 1} does not have 8 squares`);
  });
  if (kings[WHITE] !== 1 || kings[BLACK] !== 1) throw new FenError('each side must have exactly one king');
}

function homeRights(pos: Position): number {
  const b = pos.board;
  const wk = makePiece(KING, WHITE);
  const wr = makePiece(ROOK, WHITE);
  const bk = makePiece(KING, BLACK);
  const br = makePiece(ROOK, BLACK);
  let rights = 0;
  if (b[4] === wk && b[7] === wr) rights |= WK;
  if (b[4] === wk && b[0] === wr) rights |= WQ;
  if (b[60] === bk && b[63] === br) rights |= BK;
  if (b[60] === bk && b[56] === br) rights |= BQ;
  return rights;
}

export function parseFen(fen: string): Position {
  const fields = fen.trim().split(/\s+/);
  if (fields.length > 6 || fields[0] === '') throw new FenError('expected 1 to 6 fields');
  const [placement, sideField = 'w', castlingField, epField = '-', halfField = '0', fullField = '1'] = fields;

  const pos = new Position();
  parsePlacement(pos, placement);

  if (sideField !== 'w' && sideField !== 'b') throw new FenError(`invalid side to move '${sideField}'`);
  pos.side = sideField === 'w' ? WHITE : BLACK;

  const possible = homeRights(pos);
  if (castlingField === undefined) {
    pos.castling = possible; // Short FEN: inferred from home squares.
  } else if (castlingField !== '-') {
    if (!/^(K?Q?k?q?)$/.test(castlingField)) throw new FenError(`invalid castling field '${castlingField}'`);
    let wanted = 0;
    if (castlingField.includes('K')) wanted |= WK;
    if (castlingField.includes('Q')) wanted |= WQ;
    if (castlingField.includes('k')) wanted |= BK;
    if (castlingField.includes('q')) wanted |= BQ;
    pos.castling = wanted & possible; // Rights without a home king and rook are dropped.
  }

  if (epField !== '-') {
    const sq = sqFromName(epField);
    if (sq < 0) throw new FenError(`invalid en passant square '${epField}'`);
    const expectedRank = pos.side === WHITE ? 5 : 2;
    const pawnSq = sq + (pos.side === WHITE ? -8 : 8);
    if (rankOf(sq) === expectedRank && pos.board[sq] === 0
      && pos.board[pawnSq] === makePiece(PAWN, other(pos.side))) {
      pos.ep = sq;
    }
  }

  if (!/^\d{1,4}$/.test(halfField)) throw new FenError(`invalid halfmove clock '${halfField}'`);
  if (!/^[1-9]\d*$/.test(fullField)) throw new FenError(`invalid fullmove number '${fullField}'`);
  pos.halfmove = Number(halfField);
  pos.fullmove = Number(fullField);

  if (pos.inCheck(other(pos.side))) throw new FenError('the side not to move is in check');
  return pos;
}

export function toFen(pos: Position): string {
  const ranks: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let text = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const p = pos.board[rank * 8 + file];
      if (p === 0) {
        empty++;
      } else {
        if (empty) text += empty;
        empty = 0;
        const letter = LETTER_BY_TYPE[typeOf(p)];
        text += sideOf(p) === WHITE ? letter.toUpperCase() : letter;
      }
    }
    if (empty) text += empty;
    ranks.push(text);
  }
  let rights = '';
  if (pos.castling & WK) rights += 'K';
  if (pos.castling & WQ) rights += 'Q';
  if (pos.castling & BK) rights += 'k';
  if (pos.castling & BQ) rights += 'q';
  return [
    ranks.join('/'),
    pos.side === WHITE ? 'w' : 'b',
    rights || '-',
    pos.ep >= 0 ? sqName(pos.ep) : '-',
    pos.halfmove,
    pos.fullmove,
  ].join(' ');
}
