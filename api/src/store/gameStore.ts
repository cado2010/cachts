// In-memory games keyed by ID, with least-recently-used and idle eviction. Design section 6.
import { randomUUID } from 'node:crypto';
import type { Game } from '../core/game.ts';

export interface GameRecord {
  id: string;
  game: Game;
  busy: boolean;
  lastUsed: number;
}

export class GameStore {
  private games = new Map<string, GameRecord>();
  private readonly maxGames: number;
  private readonly idleMs: number;

  constructor(maxGames = 100, idleMs = 24 * 60 * 60 * 1000) {
    this.maxGames = maxGames;
    this.idleMs = idleMs;
  }

  add(game: Game): GameRecord {
    this.evictIdle();
    while (this.games.size >= this.maxGames) {
      const oldest = this.games.keys().next().value as string;
      this.games.delete(oldest);
    }
    const record: GameRecord = { id: randomUUID(), game, busy: false, lastUsed: Date.now() };
    this.games.set(record.id, record);
    return record;
  }

  get(id: string): GameRecord | undefined {
    const record = this.games.get(id);
    if (record) {
      record.lastUsed = Date.now();
      this.games.delete(id); // Re-insert so Map order stays least recently used first.
      this.games.set(id, record);
    }
    return record;
  }

  delete(id: string): boolean {
    return this.games.delete(id);
  }

  get size(): number {
    return this.games.size;
  }

  evictIdle(now = Date.now()): void {
    for (const [id, record] of this.games) {
      if (now - record.lastUsed > this.idleMs && !record.busy) this.games.delete(id);
    }
  }
}
