import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game.ts';

const play = (game: Game, ...moves: string[]): void => {
  for (const m of moves) expect(game.moveText(m), m).toEqual({ ok: true });
};

describe('captured pieces', () => {
  it('starts empty', () => {
    expect(new Game().captured()).toEqual({ white: [], black: [] });
  });

  it('records what each side took, in rank order, and undo removes it', () => {
    const game = new Game();
    // 3. Bxf7+ takes a pawn, 3... Kxf7 takes the bishop, 4. Nxe5+ takes a pawn.
    play(game, 'e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'd6', 'Bxf7', 'Kxf7', 'Nxe5', 'Nxe5');
    expect(game.captured()).toEqual({ white: ['bp', 'bp'], black: ['wB', 'wN'] });
    game.undoTurn();
    expect(game.captured()).toEqual({ white: ['bp', 'bp'], black: ['wB'] });
  });

  it('sorts queen, rook, bishop, knight, pawn', () => {
    // White takes in the order pawn, knight, rook, queen, bishop.
    const game = new Game('6k1/5b2/n1r5/8/2q5/p7/8/Q3K3 w - - 0 1');
    play(game, 'Qxa3', 'Kh8', 'Qxa6', 'Kg8', 'Qxc6', 'Kh8', 'Qxc4', 'Kg8', 'Qxf7+');
    expect(game.captured().white).toEqual(['bQ', 'bR', 'bB', 'bN', 'bp']);
  });

  it('counts an en passant capture as a pawn', () => {
    const game = new Game('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
    play(game, 'exd6');
    expect(game.captured()).toEqual({ white: ['bp'], black: [] });
  });

  it('counts a captured promoted piece as what it became', () => {
    const game = new Game('4k3/P7/8/8/8/8/7K/r7 w - - 0 1');
    play(game, 'a8=Q+', 'Rxa8');
    expect(game.captured()).toEqual({ white: [], black: ['wQ'] });
  });

  it('only counts captures made in this game, not pieces missing from a FEN', () => {
    expect(new Game('4k3/8/8/8/8/8/8/4K3 w - - 0 1').captured()).toEqual({ white: [], black: [] });
  });
});
