// The pieces one side has captured, shown beside the board, highest rank first.
import type { Color, PieceCode } from '@cachts/shared';
import { pieceName, pieceUrl } from './pieces.ts';

interface Props {
  /** The side that made the captures. */
  by: Color;
  pieces: PieceCode[];
  position: 'top' | 'bottom';
}

const title = (color: Color): string => (color === 'white' ? 'White' : 'Black');

function describe(pieces: PieceCode[]): string {
  if (pieces.length === 0) return 'nothing';
  const counts = new Map<PieceCode, number>();
  for (const code of pieces) counts.set(code, (counts.get(code) ?? 0) + 1);
  return [...counts].map(([code, n]) => `${n} ${pieceName(code).split(' ')[1]}${n > 1 ? 's' : ''}`).join(', ');
}

export function CapturedPieces({ by, pieces, position }: Props) {
  // Pieces of one type sit closer together, so each group reads as a count.
  const groups: PieceCode[][] = [];
  for (const code of pieces) {
    const last = groups.at(-1);
    if (last && last[0] === code) last.push(code);
    else groups.push([code]);
  }
  return (
    <div
      className={`captured ${position}`}
      role="img"
      aria-label={`Captured by ${title(by)}: ${describe(pieces)}`}
      data-testid={`captured-${position}`}
      data-by={by}
      data-pieces={pieces.join(' ')}
    >
      {groups.map((group, i) => (
        <span className="captured-group" key={`${group[0]}-${i}`}>
          {group.map((code, j) => <img key={j} src={pieceUrl(code)} alt="" draggable={false} />)}
        </span>
      ))}
    </div>
  );
}
