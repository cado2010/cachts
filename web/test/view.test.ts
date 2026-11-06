import { describe, expect, it } from 'vitest';
import {
  afterMove, displayedColor, initialOrientation, pressViewButton, setLocked, squareIndexAt, squareName, statusText,
} from '../src/view.ts';

describe('orientation (design 10.3)', () => {
  it('starts locked on White', () => {
    expect(displayedColor(initialOrientation(), 'black')).toBe('white');
  });
  it('U8 W and B work while locked and become the locked orientation', () => {
    const s = pressViewButton(initialOrientation(), 'black');
    expect(displayedColor(s, 'white')).toBe('black');
    expect(displayedColor(afterMove(s), 'white')).toBe('black');
  });
  it('unlocked, the board follows the side to move', () => {
    const s = setLocked(initialOrientation(), false, 'white');
    expect(displayedColor(s, 'white')).toBe('white');
    expect(displayedColor(s, 'black')).toBe('black');
  });
  it('unlocked, W or B holds until the next move', () => {
    const s = pressViewButton(setLocked(initialOrientation(), false, 'white'), 'black');
    expect(displayedColor(s, 'white')).toBe('black');
    expect(displayedColor(afterMove(s), 'white')).toBe('white');
  });
  it('locking keeps whatever is displayed', () => {
    const unlocked = setLocked(initialOrientation(), false, 'black');
    expect(displayedColor(setLocked(unlocked, true, 'black'), 'white')).toBe('black');
  });
});

describe('square mapping', () => {
  it('U7 maps through the displayed orientation', () => {
    expect(squareName(squareIndexAt(0, 0, 'white'))).toBe('a8');
    expect(squareName(squareIndexAt(7, 0, 'white'))).toBe('a1');
    expect(squareName(squareIndexAt(7, 7, 'white'))).toBe('h1');
    expect(squareName(squareIndexAt(0, 0, 'black'))).toBe('h1');
    expect(squareName(squareIndexAt(7, 7, 'black'))).toBe('a8');
  });
  it('every square appears once from either side', () => {
    for (const view of ['white', 'black'] as const) {
      const seen = new Set<number>();
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) seen.add(squareIndexAt(r, c, view));
      expect(seen.size).toBe(64);
    }
  });
});

describe('status wording', () => {
  it.each([
    [{ state: 'active' }, ''],
    [{ state: 'check', player: 'white' }, 'White in Check!'],
    [{ state: 'checkmate', winner: 'black' }, 'Check Mate [Black] wins!!'],
    [{ state: 'stalemate' }, 'Stale Mate'],
    [{ state: 'draw', reason: 'agreement' }, 'Draw'],
    [{ state: 'draw', reason: 'insufficient-material' }, 'Draw (insufficient material)'],
    [{ state: 'draw', reason: 'repetition' }, 'Draw (threefold repetition)'],
    [{ state: 'resigned', winner: 'black' }, 'White resigned, Black wins'], // U9
  ] as const)('%j', (status, text) => {
    expect(statusText(status)).toBe(text);
  });
});
