// The board, from cachRendering/BoardRenderer.Render. Screen row 0 is the top of the board.
import { BOARD_COLORS, type Color, type GameView, type PieceCode } from '@cachts/shared';
import { squareIndexAt, squareName } from '../view.ts';

const images = import.meta.glob<string>('../../../shared/assets/pieces/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});
const pieceUrl = (code: PieceCode): string => images[`../../../shared/assets/pieces/${code}.png`];

const PIECE_NAMES: Record<string, string> = {
  K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', p: 'pawn',
};
const pieceName = (code: PieceCode): string =>
  `${code[0] === 'w' ? 'white' : 'black'} ${PIECE_NAMES[code[1]]}`;

interface Props {
  game: GameView;
  view: Color;
  selected: number | null;
  /** The engine's origin square, highlighted as in the original. */
  engineFrom: string | null;
  disabled: boolean;
  onSquareClick: (index: number) => void;
}

const RANGE = [0, 1, 2, 3, 4, 5, 6, 7];

export function Board({ game, view, selected, engineFrom, disabled, onSquareClick }: Props) {
  const files = RANGE.map((i) => String.fromCharCode(97 + (view === 'white' ? i : 7 - i)));
  const ranks = RANGE.map((i) => String(view === 'white' ? 8 - i : i + 1));
  const lastTo = game.lastMove?.to ?? null;

  return (
    <div className="board-frame">
      <div className="coords files top" aria-hidden="true">{files.map((f) => <span key={f}>{f}</span>)}</div>
      <div className="coords ranks left" aria-hidden="true">{ranks.map((r) => <span key={r}>{r}</span>)}</div>
      <div className="board" role="grid" aria-label="Chess board" data-view={view}>
        {RANGE.flatMap((row) => RANGE.map((col) => {
          const index = squareIndexAt(row, col, view);
          const name = squareName(index);
          const code = game.board[index];
          const dark = (row + col) % 2 === 1;
          const classes = ['square'];
          if (lastTo === name) classes.push('last-move');
          if (selected === index || engineFrom === name) classes.push('highlight');
          return (
            <button
              key={name}
              type="button"
              role="gridcell"
              className={classes.join(' ')}
              style={{ background: dark ? BOARD_COLORS.dark : BOARD_COLORS.light }}
              data-square={name}
              data-piece={code ?? ''}
              aria-label={code ? `${name}, ${pieceName(code)}` : name}
              aria-pressed={selected === index}
              aria-disabled={disabled}
              onClick={() => onSquareClick(index)}
            >
              {code && <img src={pieceUrl(code)} alt="" draggable={false} />}
            </button>
          );
        }))}
      </div>
      <div className="coords ranks right" aria-hidden="true">{ranks.map((r) => <span key={r}>{r}</span>)}</div>
      <div className="coords files bottom" aria-hidden="true">{files.map((f) => <span key={f}>{f}</span>)}</div>
    </div>
  );
}
