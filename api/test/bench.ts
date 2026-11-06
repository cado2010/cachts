// Depth-4 timing, to compare with the C# baseline in design section 8.6. Run: npm run bench
import { parseFen, START_FEN } from '../src/core/fen.ts';
import { searchRoot } from '../src/engine/search.ts';

const CASES: [string, string, number][] = [
  ['start position', START_FEN, 1500],
  ['middlegame', 'r1bqkb1r/pp3ppp/2n1pn2/2pp4/3P4/2N1PN2/PPP1BPPP/R1BQK2R b KQkq - 0 1', 5000],
];
for (const [name, fen, baseline] of CASES) {
  const started = performance.now();
  const { nodes, candidates, value } = searchRoot(parseFen(fen), 4);
  const ms = Math.round(performance.now() - started);
  console.log(`${name}: ${ms} ms (C# about ${baseline} ms), ${nodes} nodes, value ${value}, ${candidates.length} candidates`);
}
