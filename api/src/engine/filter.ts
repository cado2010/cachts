// Choosing among equal moves: the original FilterMoves policy with ledger E9 fixed. Design section 8.3.
import type { Game } from '../core/game.ts';
import { KING, QUEEN, ROOK, isCapture, isCastle, moveFrom, typeOf } from '../core/position.ts';
import { isEndGame } from './evaluator.ts';

export function applyPreferences(game: Game, candidates: number[]): number[] {
  const pos = game.pos;
  const endGame = isEndGame(pos);
  const middleGame = game.isMiddleGameLike() && !endGame;
  const castled = game.hasCastled(pos.side);

  const allowed = candidates.filter((m) => {
    if (isCastle(m)) return true; // Exempt, as in the original.
    const type = typeOf(pos.board[moveFrom(m)]);
    if (type === KING) return endGame;
    if (type === ROOK) return castled;
    if (type === QUEEN) return middleGame;
    return true;
  });
  const pool = allowed.length > 0 ? allowed : candidates;
  const captures = pool.filter(isCapture);
  return captures.length > 0 ? captures : pool;
}
