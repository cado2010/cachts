// Pure UI rules: board orientation (design 10.3), square mapping and status wording (10.2).
import { START_FEN, isGameOver, type Color, type GameStatus, type GameView } from '@cachts/shared';

export interface OrientationState {
  /** "Always show current view". */
  locked: boolean;
  lockedColor: Color;
  /** W or B pressed since the last move; cleared on the next move. */
  forced: Color | null;
}

export const initialOrientation = (color: Color = 'white'): OrientationState => ({
  locked: true,
  lockedColor: color,
  forced: null,
});

export const displayedColor = (s: OrientationState, toMove: Color): Color =>
  s.locked ? s.lockedColor : s.forced ?? toMove;

export const pressViewButton = (s: OrientationState, color: Color): OrientationState => ({
  ...s,
  forced: color,
  lockedColor: s.locked ? color : s.lockedColor,
});

export const setLocked = (s: OrientationState, locked: boolean, toMove: Color): OrientationState => (
  locked ? { ...s, locked, lockedColor: displayedColor(s, toMove) } : { ...s, locked, forced: null }
);

export const afterMove = (s: OrientationState): OrientationState => ({ ...s, forced: null });

/** Board index (0 = a1) of the square shown at a screen row and column. */
export const squareIndexAt = (row: number, col: number, view: Color): number =>
  view === 'white' ? (7 - row) * 8 + col : row * 8 + (7 - col);

export const squareName = (index: number): string =>
  String.fromCharCode(97 + (index & 7)) + ((index >> 3) + 1);

/** Whether a reload would lose anything: unfinished, with moves played or a custom position set up. */
export const isInProgress = (game: GameView): boolean =>
  !isGameOver(game.status) && (game.pgn.length > 0 || game.fen !== START_FEN);

const title = (c: Color): string => (c === 'white' ? 'White' : 'Black');
export { title as colorTitle };

export function statusText(status: GameStatus): string {
  switch (status.state) {
    case 'active': return '';
    case 'check': return `${title(status.player)} in Check!`;
    case 'checkmate': return `Check Mate [${title(status.winner)}] wins!!`;
    case 'stalemate': return 'Stale Mate';
    case 'draw':
      if (status.reason === 'insufficient-material') return 'Draw (insufficient material)';
      return status.reason === 'repetition' ? 'Draw (threefold repetition)' : 'Draw';
    case 'resigned':
      return `${title(status.winner === 'white' ? 'black' : 'white')} resigned, ${title(status.winner)} wins`;
  }
}
