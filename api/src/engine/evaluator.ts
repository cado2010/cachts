// Position evaluation. All values are copied from cacheEngine/BoardEvaluator.cs. Design section 8.2.
import {
  BISHOP, BLACK, KING, KNIGHT, PAWN, Position, QUEEN, ROOK, WHITE, other, sideOf, typeOf, type Side,
} from '../core/position.ts';

const PIECE_VALUE = [0, 20000, 900, 500, 330, 320, 100];

// Tables as in the C# source: first row is rank 1, for White.
const WHITE_TABLES: Record<number, number[][]> = {
  [PAWN]: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [5, 10, 10, -20, -20, 10, 10, 5],
    [5, -5, -10, 0, 0, -10, -5, 5],
    [0, 0, 0, 20, 20, 0, 0, 0],
    [5, 5, 10, 25, 25, 10, 5, 5],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [70, 70, 70, 70, 70, 70, 70, 70],
  ],
  [KNIGHT]: [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0, 5, 5, 0, -20, -40],
    [-30, 5, 10, 15, 15, 10, 5, -30],
    [-30, 0, 15, 20, 20, 15, 0, -30],
    [-30, 5, 15, 20, 20, 15, 5, -30],
    [-30, 0, 10, 15, 15, 10, 0, -30],
    [-40, -20, 0, 0, 0, 0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50],
  ],
  [BISHOP]: [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10, 5, 0, 0, 0, 0, 5, -10],
    [-10, 10, 10, 10, 10, 10, 10, -10],
    [-10, 0, 10, 10, 10, 10, 0, -10],
    [-10, 5, 5, 10, 10, 5, 5, -10],
    [-10, 0, 5, 10, 10, 5, 0, -10],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20],
  ],
  [ROOK]: [
    [0, 0, 0, 5, 5, 0, 0, 0],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [5, 10, 10, 10, 10, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ],
  [QUEEN]: [
    [-20, -10, -10, -5, -5, -10, -10, -20],
    [-10, 0, 5, 0, 0, 0, 0, -10],
    [-10, 5, 5, 5, 5, 5, 0, -10],
    [0, 0, 5, 5, 5, 5, 0, -5],
    [-5, 0, 5, 5, 5, 5, 0, -5],
    [-10, 0, 5, 5, 5, 5, 0, -10],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-20, -10, -10, -5, -5, -10, -10, -20],
  ],
  [KING]: [
    [-50, -30, -30, -30, -30, -30, -30, -50],
    [-30, -30, 0, 0, 0, 0, -30, -30],
    [-30, -10, 20, 30, 30, 20, -10, -30],
    [-30, -10, 30, 40, 40, 30, -10, -30],
    [-30, -10, 30, 40, 40, 30, -10, -30],
    [-30, -10, 20, 30, 30, 20, -10, -30],
    [-30, -20, -10, 0, 0, -10, -20, -30],
    [-50, -40, -30, -20, -20, -30, -40, -50],
  ],
};

/** Piece-plus-square value indexed by the encoded piece, then square. Black mirrors White by rank. */
const SCORE: Int32Array[] = (() => {
  const table: Int32Array[] = Array.from({ length: 16 }, () => new Int32Array(64));
  for (let type = KING; type <= PAWN; type++) {
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const sq = rank * 8 + file;
        table[type | (WHITE << 3)][sq] = PIECE_VALUE[type] + WHITE_TABLES[type][rank][file];
        table[type | (BLACK << 3)][sq] = PIECE_VALUE[type] + WHITE_TABLES[type][7 - rank][file];
      }
    }
  }
  return table;
})();

const CHECK_ADJUSTMENT = 450;
const MATE_BASE = 30000;
const MATE_DEPTH_STEP = 20000; // Larger than any realistic swing between two mating lines (D2).

export function evaluate(pos: Position, engine: Side): number {
  const b = pos.board;
  let value = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = b[sq];
    if (p !== 0) value += sideOf(p) === engine ? SCORE[p][sq] : -SCORE[p][sq];
  }
  if (pos.inCheck(engine)) value -= CHECK_ADJUSTMENT;
  else if (pos.inCheck(other(engine))) value += CHECK_ADJUSTMENT;
  return value;
}

/** Score for the side to move having no legal moves. Stalemate is a draw (ledger E6). */
export function terminalValue(pos: Position, engine: Side, remainingDepth: number): number {
  if (!pos.inCheck(pos.side)) return 0;
  const mate = MATE_BASE + MATE_DEPTH_STEP * remainingDepth;
  return (pos.side === engine ? -mate : mate) + evaluate(pos, engine);
}

/** Ledger E5: kings are excluded, so this can actually become true. */
export function isEndGame(pos: Position): boolean {
  const totals = [0, 0];
  for (let sq = 0; sq < 64; sq++) {
    const p = pos.board[sq];
    if (p !== 0 && typeOf(p) !== KING) totals[sideOf(p)] += PIECE_VALUE[typeOf(p)];
  }
  const [w, b] = totals;
  return (w < 1500 && b < 2000) || (b < 1500 && w < 2000);
}
