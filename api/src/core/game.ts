// A game: position, move history, result and player sides. Replaces Game.cs, GameController.cs and
// the move-list half of BoardHistory.cs. Undo follows design section 7.7.
import type { Color, GameStatus, LastMove, MoveErrorCode, PieceCode } from '@cachts/shared';
import { START_FEN, parseFen, toFen } from './fen.ts';
import { ParseError, parseMoveInput, resolveClick, resolveParsed, san, sanBase } from './notation.ts';
import {
  BISHOP, BLACK, KNIGHT, PAWN, Position, WHITE, isCastle, moveFrom, moveTo, other, sideOf, sqName, typeOf, type Side,
} from './position.ts';

export interface HistoryEntry {
  move: number;
  san: string;
  /** SAN without check or mate suffix, the form the opening book uses. */
  bookPly: string;
  side: Side;
  pieceType: number;
  /** True when played for the engine's side (not Aid Engine Move, which counts as the human's). */
  byEngine: boolean;
}

type ManualResult = { kind: 'agreement' } | { kind: 'resigned'; winner: Side };

export type MoveResult = { ok: true } | { ok: false; error: MoveErrorCode };

const toColor = (side: Side): Color => (side === WHITE ? 'white' : 'black');
export const toSide = (color: Color): Side => (color === 'white' ? WHITE : BLACK);

const PIECE_CODES: Record<number, string> = { 1: 'K', 2: 'Q', 3: 'R', 4: 'B', 5: 'N', 6: 'p' };

export class Game {
  readonly pos: Position;
  readonly startFen: string;
  readonly humanSide: Side;
  readonly history: HistoryEntry[] = [];
  private manualResult: ManualResult | null = null;
  private readonly startFullmove: number;
  /** Repetition key of the start position and of the position after each move. */
  private readonly positionKeys: string[];

  constructor(fen: string = START_FEN, humanSide?: Side) {
    this.pos = parseFen(fen);
    this.startFen = toFen(this.pos);
    this.startFullmove = this.pos.fullmove;
    this.positionKeys = [this.pos.repetitionKey()];
    // Design D1: on a FEN board the human plays the side to move.
    this.humanSide = humanSide ?? this.pos.side;
  }

  get engineSide(): Side {
    return other(this.humanSide);
  }

  /** The opening book only applies to games from the standard start (ledger E14). */
  get isStandardStart(): boolean {
    return this.startFen === START_FEN;
  }

  get status(): GameStatus {
    const m = this.manualResult;
    if (m?.kind === 'agreement') return { state: 'draw', reason: 'agreement' };
    if (m?.kind === 'resigned') return { state: 'resigned', winner: toColor(m.winner) };
    const pos = this.pos;
    const inCheck = pos.inCheck(pos.side);
    if (!pos.hasLegalMove()) {
      return inCheck ? { state: 'checkmate', winner: toColor(other(pos.side)) } : { state: 'stalemate' };
    }
    if (pos.isInsufficientMaterial()) return { state: 'draw', reason: 'insufficient-material' };
    if (this.currentOccurrences() >= 3) return { state: 'draw', reason: 'repetition' };
    return inCheck ? { state: 'check', player: toColor(pos.side) } : { state: 'active' };
  }

  get isOver(): boolean {
    const state = this.status.state;
    return state !== 'active' && state !== 'check';
  }

  /** Plays typed notation for the side to move. */
  moveText(text: string): MoveResult {
    if (this.isOver) return { ok: false, error: 'GameOver' };
    let parsed;
    try {
      parsed = parseMoveInput(this.pos.side, text);
    } catch (e) {
      if (e instanceof ParseError) return { ok: false, error: 'InvalidFormat' };
      throw e;
    }
    if (parsed.kind === 'draw') {
      this.manualResult = { kind: 'agreement' };
      return { ok: true };
    }
    if (parsed.kind === 'resign') {
      this.manualResult = { kind: 'resigned', winner: other(this.pos.side) };
      return { ok: true };
    }
    const resolved = resolveParsed(this.pos, parsed);
    if (!resolved.ok) return resolved;
    this.play(resolved.move, false);
    return { ok: true };
  }

  /** Plays a click move for the side to move. */
  moveClick(from: number, to: number, promotion: number): MoveResult {
    if (this.isOver) return { ok: false, error: 'GameOver' };
    const resolved = resolveClick(this.pos, from, to, promotion);
    if (!resolved.ok) return resolved;
    this.play(resolved.move, false);
    return { ok: true };
  }

  /** Plays an already-validated legal move. */
  play(move: number, byEngine: boolean): void {
    const pos = this.pos;
    const legal = pos.generateLegal();
    const entry: HistoryEntry = {
      move,
      san: san(pos, move, legal),
      bookPly: sanBase(pos, move, legal),
      side: pos.side,
      pieceType: typeOf(pos.board[moveFrom(move)]),
      byEngine,
    };
    pos.make(move);
    this.history.push(entry);
    this.positionKeys.push(pos.repetitionKey());
  }

  /** Design 7.7. Returns false when there was nothing to undo. */
  undoTurn(): boolean {
    if (this.manualResult) {
      this.manualResult = null;
      return true;
    }
    const n = this.history.length;
    if (n === 0) return false;
    if (this.history[n - 1].byEngine) {
      if (n < 2) return false; // Only the engine's opening move: it would just move again.
      this.popMove();
    }
    this.popMove();
    return true;
  }

  private popMove(): void {
    this.pos.unmake((this.history.pop() as HistoryEntry).move);
    this.positionKeys.pop();
  }

  /** Positions since the last irreversible move, the only ones that can still repeat. */
  repetitionHistory(): string[] {
    return this.positionKeys.slice(-(Math.min(this.pos.halfmove, this.positionKeys.length - 1) + 1));
  }

  private currentOccurrences(): number {
    const keys = this.repetitionHistory();
    const current = keys[keys.length - 1];
    return keys.filter((k) => k === current).length;
  }

  /** Move-list lines: "1. e4 e5", or "1... e5" for a game starting with Black to move. */
  pgnList(): string[] {
    const lines: string[] = [];
    let number = this.startFullmove;
    let line = '';
    this.history.forEach((entry, i) => {
      if (entry.side === WHITE) {
        line = `${number}. ${entry.san}`;
      } else {
        line = i === 0 ? `${number}... ${entry.san}` : `${line} ${entry.san}`;
        lines.push(line);
        line = '';
        number++;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  get bookPlies(): string[] {
    return this.history.map((h) => h.bookPly);
  }

  get lastMove(): LastMove | null {
    const last = this.history.at(-1);
    if (!last) return null;
    return {
      from: sqName(moveFrom(last.move)),
      to: sqName(moveTo(last.move)),
      san: last.san,
      color: toColor(last.side),
    };
  }

  boardCodes(): (PieceCode | null)[] {
    return Array.from(this.pos.board, (p) =>
      p === 0 ? null : (`${sideOf(p) === WHITE ? 'w' : 'b'}${PIECE_CODES[typeOf(p)]}` as PieceCode));
  }

  fen(): string {
    return toFen(this.pos);
  }

  /** Ledger R8: based on the structured move, not the text typed. */
  hasCastled(side: Side): boolean {
    return this.history.some((h) => h.side === side && isCastle(h.move));
  }

  /** BoardHistory.IsMiddleGameLike, using its code's thresholds (design 8.3). */
  isMiddleGameLike(): boolean {
    const minors = [0, 0];
    const pawns = [0, 0];
    for (const h of this.history) {
      if (h.pieceType === BISHOP || h.pieceType === KNIGHT) minors[h.side]++;
      else if (h.pieceType === PAWN) pawns[h.side]++;
    }
    return minors[WHITE] >= 2 && minors[BLACK] >= 2 && pawns[WHITE] >= 3 && pawns[BLACK] >= 3;
  }
}
