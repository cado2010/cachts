// Alpha-beta search with exact root ties. Replaces Engine.AlphaBetaPruningSearch. Design section 8.1.
import { Position, isCapture, isCastle, type Side } from '../core/position.ts';
import { evaluate, terminalValue } from './evaluator.ts';

export interface SearchResult {
  value: number;
  candidates: number[];
  nodes: number;
}

/** Captures, then quiet moves, then castling. Stable, so the order is fixed. */
function ordered(moves: number[]): number[] {
  const captures: number[] = [];
  const quiet: number[] = [];
  const castles: number[] = [];
  for (const m of moves) {
    if (isCapture(m)) captures.push(m);
    else if (isCastle(m)) castles.push(m);
    else quiet.push(m);
  }
  return captures.concat(quiet, castles);
}

// A third occurrence needs two returns of two moves each, so at least 8 reversible half-moves.
const MIN_HALFMOVES_TO_REPEAT = 8;

function countKeys(history: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of history) counts.set(key, (counts.get(key) ?? 0) + 1);
  return counts;
}

/** Scores a third occurrence as a draw, and otherwise counts this position while searching below it. */
function withRepetition(pos: Position, counts: Map<string, number>, body: () => number): number {
  const key = pos.repetitionKey();
  const seen = counts.get(key) ?? 0;
  if (seen >= 2) return 0;
  counts.set(key, seen + 1);
  const value = body();
  counts.set(key, seen);
  return value;
}

/**
 * The position is unchanged afterwards. The side to move is the engine's side.
 * history holds the repetition keys of earlier positions, as from Game.repetitionHistory().
 */
export function searchRoot(pos: Position, depth: number, history: readonly string[] = []): SearchResult {
  const engine: Side = pos.side;
  const counts = countKeys(history);
  let nodes = 0;

  const search = (remaining: number, alpha: number, beta: number, maximizing: boolean): number => {
    nodes++;
    if (pos.isInsufficientMaterial()) return 0;
    return pos.halfmove >= MIN_HALFMOVES_TO_REPEAT
      ? withRepetition(pos, counts, () => expand(remaining, alpha, beta, maximizing))
      : expand(remaining, alpha, beta, maximizing);
  };

  const expand = (remaining: number, alphaIn: number, betaIn: number, maximizing: boolean): number => {
    if (remaining === 0) {
      return pos.hasLegalMove() ? evaluate(pos, engine) : terminalValue(pos, engine, 0);
    }
    const moves = pos.generateLegal();
    if (moves.length === 0) return terminalValue(pos, engine, remaining);

    let alpha = alphaIn;
    let beta = betaIn;
    if (maximizing) {
      let best = -Infinity;
      for (const m of ordered(moves)) {
        pos.make(m);
        const v = search(remaining - 1, alpha, beta, false);
        pos.unmake(m);
        if (v > best) best = v;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      return best;
    }
    let best = Infinity;
    for (const m of ordered(moves)) {
      pos.make(m);
      const v = search(remaining - 1, alpha, beta, true);
      pos.unmake(m);
      if (v < best) best = v;
      if (best < beta) beta = best;
      if (alpha >= beta) break;
    }
    return best;
  };

  let best = -Infinity;
  let candidates: number[] = [];
  for (const m of ordered(pos.generateLegal())) {
    pos.make(m);
    // best - 1 keeps a move equal to best inside the window, so its score is exact, not a bound.
    const v = search(Math.max(depth - 1, 0), best - 1, Infinity, false);
    pos.unmake(m);
    if (v > best) {
      best = v;
      candidates = [m];
    } else if (v === best) {
      candidates.push(m);
    }
  }
  return { value: best, candidates, nodes };
}

/** Plain minimax with the same scoring, used only to verify the pruning in tests. */
export function minimaxRoot(
  pos: Position,
  depth: number,
  history: readonly string[] = [],
): { value: number; candidates: number[] } {
  const engine: Side = pos.side;
  const counts = countKeys(history);
  const search = (remaining: number, maximizing: boolean): number => {
    if (pos.isInsufficientMaterial()) return 0;
    return pos.halfmove >= MIN_HALFMOVES_TO_REPEAT
      ? withRepetition(pos, counts, () => expand(remaining, maximizing))
      : expand(remaining, maximizing);
  };
  const expand = (remaining: number, maximizing: boolean): number => {
    if (remaining === 0) return pos.hasLegalMove() ? evaluate(pos, engine) : terminalValue(pos, engine, 0);
    const moves = pos.generateLegal();
    if (moves.length === 0) return terminalValue(pos, engine, remaining);
    let best = maximizing ? -Infinity : Infinity;
    for (const m of moves) {
      pos.make(m);
      const v = search(remaining - 1, !maximizing);
      pos.unmake(m);
      best = maximizing ? Math.max(best, v) : Math.min(best, v);
    }
    return best;
  };
  let best = -Infinity;
  let candidates: number[] = [];
  for (const m of pos.generateLegal()) {
    pos.make(m);
    const v = search(depth - 1, false);
    pos.unmake(m);
    if (v > best) {
      best = v;
      candidates = [m];
    } else if (v === best) {
      candidates.push(m);
    }
  }
  return { value: best, candidates };
}
