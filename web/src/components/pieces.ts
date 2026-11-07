// Piece images and names, shared by the board and the captured pieces.
import type { PieceCode } from '@cachts/shared';

const images = import.meta.glob<string>('../../../shared/assets/pieces/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});
export const pieceUrl = (code: PieceCode): string => images[`../../../shared/assets/pieces/${code}.png`];

const PIECE_NAMES: Record<string, string> = {
  K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', p: 'pawn',
};
export const pieceName = (code: PieceCode): string =>
  `${code[0] === 'w' ? 'white' : 'black'} ${PIECE_NAMES[code[1]]}`;
