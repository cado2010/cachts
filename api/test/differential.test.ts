// Compares the rules against chess.js over seeded random games, ply by ply.
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game.ts';
import { san } from '../src/core/notation.ts';

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GAMES = 1000;
const MAX_PLIES = 300;

// chess.js only writes an en passant square when a capture is possible, so that field is compared loosely.
const withoutEp = (fen: string): string => {
  const f = fen.split(' ');
  f[3] = '-';
  return f.join(' ');
};

describe('differential against chess.js', () => {
  it(`agrees over ${GAMES} random games`, async () => {
    const seen = { checkmate: 0, stalemate: 0, insufficient: 0, repetition: 0, plies: 0, castles: 0, ep: 0, promos: 0 };
    for (let g = 0; g < GAMES; g++) {
      if (g % 10 === 0) await new Promise((r) => setImmediate(r));
      const rand = mulberry32(g + 1);
      const game = new Game();
      const oracle = new Chess();
      for (let ply = 0; ply < MAX_PLIES; ply++) {
        const pos = game.pos;
        const legal = pos.generateLegal();
        const ours = legal.map((m) => san(pos, m, legal)).sort();
        const theirs = oracle.moves().sort();
        expect(ours, `game ${g} ply ${ply} fen ${game.fen()}`).toEqual(theirs);
        expect(withoutEp(game.fen())).toBe(withoutEp(oracle.fen()));
        expect(pos.inCheck(pos.side)).toBe(oracle.isCheck());
        const full = game.status;
        const status = full.state;
        const reason = full.state === 'draw' ? full.reason : null;
        expect(status === 'checkmate').toBe(oracle.isCheckmate());
        expect(status === 'stalemate').toBe(oracle.isStalemate());
        // Mate and stalemate take precedence in ours; chess.js reports each condition separately.
        if (status !== 'checkmate' && status !== 'stalemate') {
          expect(oracle.isInsufficientMaterial()).toBe(reason === 'insufficient-material');
          if (reason !== 'insufficient-material') expect(oracle.isThreefoldRepetition()).toBe(reason === 'repetition');
        }
        seen.plies++;
        if (status === 'checkmate') seen.checkmate++;
        if (status === 'stalemate') seen.stalemate++;
        if (reason === 'insufficient-material') seen.insufficient++;
        if (reason === 'repetition') seen.repetition++;
        if (game.isOver) break;
        const move = legal[Math.floor(rand() * legal.length)];
        const text = san(pos, move, legal);
        if (text.startsWith('O-O')) seen.castles++;
        if (text.includes('=')) seen.promos++;
        if ((move >> 15) & 2) seen.ep++;
        game.play(move, false);
        oracle.move(text);
      }
    }
    console.log('differential coverage', seen);
    // The run has to reach the interesting rules, or agreement proves little.
    for (const key of Object.keys(seen) as (keyof typeof seen)[]) expect(seen[key]).toBeGreaterThan(0);
  }, 600000);
});
