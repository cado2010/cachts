// Move generation against published perft counts (chessprogramming.org/Perft_Results).
import { describe, expect, it } from 'vitest';
import { parseFen, START_FEN } from '../src/core/fen.ts';
import type { Position } from '../src/core/position.ts';

function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  let nodes = 0;
  for (const m of pos.generateLegal()) {
    pos.make(m);
    nodes += perft(pos, depth - 1);
    pos.unmake(m);
  }
  return nodes;
}

const CASES: [string, string, number[]][] = [
  ['start', START_FEN, [20, 400, 8902, 197281, 4865609]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862, 4085603]],
  ['position 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238, 674624]],
  ['position 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467, 422333]],
  ['position 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379, 2103487]],
];

describe('perft', () => {
  for (const [name, fen, counts] of CASES) {
    counts.forEach((expected, i) => {
      it(`${name} depth ${i + 1} = ${expected}`, () => {
        expect(perft(parseFen(fen), i + 1)).toBe(expected);
      }, 120000);
    });
  }
});
