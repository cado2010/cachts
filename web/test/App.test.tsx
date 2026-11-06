// UI behaviour against a mocked API. The UI ledger IDs are named where they apply.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { START_FEN, type Color, type GameStatus, type GameView, type PieceCode } from '@cachts/shared';
import { App } from '../src/App.tsx';
import { browser } from '../src/browser.ts';

const START: (PieceCode | null)[] = (() => {
  const b: (PieceCode | null)[] = new Array(64).fill(null);
  const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  back.forEach((p, i) => {
    b[i] = `w${p}` as PieceCode;
    b[56 + i] = `b${p}` as PieceCode;
    b[8 + i] = 'wp';
    b[48 + i] = 'bp';
  });
  return b;
})();

const view = (over: Partial<GameView> = {}): GameView => ({
  id: 'g1',
  fen: START_FEN,
  board: START,
  toMove: 'white',
  humanColor: 'white',
  engineColor: 'black',
  status: { state: 'active' },
  pgn: [],
  lastMove: null,
  ...over,
});
const engineResponse = (game: GameView) => ({
  game,
  engineMove: { san: 'e5', source: 'book', value: null, candidates: 1, nodes: 0, elapsedMs: 1 },
});

type Handler = (body: unknown) => { status?: number; json: unknown };
let routes: Record<string, Handler>;
let calls: { path: string; body: unknown }[];

const errorResponse = (status: number, code: string, message = code) => ({ status, json: { error: { code, message } } });

beforeEach(() => {
  sessionStorage.clear();
  calls = [];
  routes = {
    'GET /api/health': () => ({ json: { status: 'ready', bookNodes: 1 } }),
    'POST /api/games': () => ({ status: 201, json: view() }),
    'DELETE /api/games/g1': () => ({ status: 204, json: {} }),
  };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ path: key, body });
    const handler = routes[key];
    if (!handler) return new Response(JSON.stringify({ error: { code: 'BadRequest', message: key } }), { status: 400 });
    const { status = 200, json } = handler(body);
    return new Response(status === 204 ? null : JSON.stringify(json), { status });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const square = (name: string): HTMLElement =>
  document.querySelector(`[data-square="${name}"]`) as HTMLElement;
const ready = async (): Promise<void> => {
  await screen.findByRole('button', { name: 'Move' });
};
const called = (path: string) => calls.filter((c) => c.path === path);

describe('startup', () => {
  it('shows the original loading message until the book is ready', async () => {
    let status = 'loading';
    routes['GET /api/health'] = () => ({ json: { status, bookNodes: 0 } });
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('Please wait, loading Opening Book ...');
    status = 'ready';
    await waitFor(() => expect(screen.getByLabelText('Move/FEN:')).toBeInTheDocument(), { timeout: 2000 });
  });
});

describe('controls', () => {
  it('shows all the original controls', async () => {
    render(<App />);
    await ready();
    for (const name of ['Move', 'Undo', 'Aid Engine Move', 'Create Board', 'View from White', 'View from Black',
      'Play Black', 'Dump FEN']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('checkbox', { name: 'Always show current view' })).toBeChecked();
    expect(screen.getByTestId('to-move')).toHaveTextContent('White');
  });

  it('colours a1 dark and h1 light, as the original board squares', async () => {
    render(<App />);
    await ready();
    expect(square('a1').style.background).toBe('rgb(139, 69, 19)');
    expect(square('h1').style.background).toBe('rgb(244, 164, 96)');
    expect(square('a8').style.background).toBe('rgb(244, 164, 96)');
  });

  it('U1 Move sends the text, renders the move, then renders the engine reply and labels', async () => {
    const afterHuman = view({ toMove: 'black', pgn: ['1. e4'], lastMove: { from: 'e2', to: 'e4', san: 'e4', color: 'white' } });
    const afterEngine = view({
      toMove: 'white',
      pgn: ['1. e4 e5'],
      status: { state: 'check', player: 'white' },
      lastMove: { from: 'e7', to: 'e5', san: 'e5', color: 'black' },
    });
    routes['POST /api/games/g1/moves'] = () => ({ json: afterHuman });
    routes['POST /api/games/g1/engine-move'] = () => ({ json: engineResponse(afterEngine) });
    const user = userEvent.setup();
    render(<App />);
    await ready();
    await user.type(screen.getByLabelText('Move/FEN:'), 'e4{Enter}'); // D4: Enter submits.
    await waitFor(() => expect(screen.getByTestId('move-list')).toHaveTextContent('1. e4 e5'));
    expect(called('POST /api/games/g1/moves')[0].body).toEqual({ move: 'e4' });
    expect(screen.getByTestId('to-move')).toHaveTextContent('White');
    expect(screen.getByTestId('game-status')).toHaveTextContent('White in Check!');
    expect(screen.getByLabelText('Move/FEN:')).toHaveValue('');
    expect(square('e7')).toHaveClass('highlight');
    expect(square('e5')).toHaveClass('last-move');
  });

  it('U12 a castling move gets a last-move highlight from its structured squares', async () => {
    routes['POST /api/games'] = () => ({
      status: 201,
      json: view({ lastMove: { from: 'e1', to: 'g1', san: 'O-O', color: 'white' } }),
    });
    render(<App />);
    await ready();
    expect(square('g1')).toHaveClass('last-move');
  });

  it('U14 a move after game over shows GameOver instead of silently reusing a result', async () => {
    routes['POST /api/games/g1/moves'] = () => errorResponse(422, 'GameOver');
    const user = userEvent.setup();
    render(<App />);
    await ready();
    await user.type(screen.getByLabelText('Move/FEN:'), 'e4{Enter}');
    expect(await screen.findByRole('dialog')).toHaveTextContent('reason: GameOver');
  });

  it('does nothing for an empty Move box', async () => {
    const user = userEvent.setup();
    render(<App />);
    await ready();
    await user.click(screen.getByRole('button', { name: 'Move' }));
    expect(called('POST /api/games/g1/moves')).toHaveLength(0);
  });

  it('shows a move error once, in the original format, with no engine reply (U5)', async () => {
    routes['POST /api/games/g1/moves'] = () => errorResponse(422, 'InvalidFormat');
    const user = userEvent.setup();
    render(<App />);
    await ready();
    await user.type(screen.getByLabelText('Move/FEN:'), 'Nf9');
    await user.click(screen.getByRole('button', { name: 'Move' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Move error: White cannot make move: Nf9, reason: InvalidFormat');
    expect(called('POST /api/games/g1/engine-move')).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(called('POST /api/games/g1/moves')).toHaveLength(1);
  });

  it('U10 restores controls after a server failure', async () => {
    routes['POST /api/games/g1/moves'] = () => errorResponse(500, 'InternalError', 'Unexpected server error.');
    const user = userEvent.setup();
    render(<App />);
    await ready();
    await user.type(screen.getByLabelText('Move/FEN:'), 'e4{Enter}');
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  it('U13 disables controls and shows thinking while the engine works; W and B stay active', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    routes['POST /api/games/g1/moves'] = () => ({ json: view({ toMove: 'black' }) });
    const fetchMock = vi.mocked(fetch);
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/engine-move')) {
        await gate;
        return new Response(JSON.stringify(engineResponse(view())), { status: 200 });
      }
      return original(url, init);
    });
    const user = userEvent.setup();
    render(<App />);
    await ready();
    await user.type(screen.getByLabelText('Move/FEN:'), 'e4{Enter}');
    await screen.findByText('Cach is thinking…');
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Play Black' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'View from Black' }));
    expect(screen.getByRole('grid')).toHaveAttribute('data-view', 'black');
    release();
    await waitFor(() => expect(screen.queryByText('Cach is thinking…')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Move' })).toBeEnabled();
  });

  it('Undo renders the result and clears highlights', async () => {
    routes['POST /api/games/g1/moves'] = () => ({ json: view({ toMove: 'black' }) });
    routes['POST /api/games/g1/engine-move'] = () => ({
      json: engineResponse(view({ lastMove: { from: 'e7', to: 'e5', san: 'e5', color: 'black' } })),
    });
    routes['POST /api/games/g1/undo'] = () => ({ json: view({ fen: 'after-undo' }) });
    const user = userEvent.setup();
    render(<App />);
    await ready();
    await user.type(screen.getByLabelText('Move/FEN:'), 'e4{Enter}');
    await waitFor(() => expect(square('e7')).toHaveClass('highlight'));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(square('e7')).not.toHaveClass('highlight'));
    await user.click(screen.getByRole('button', { name: 'Dump FEN' }));
    expect(screen.getByLabelText('Move/FEN:')).toHaveValue('after-undo');
  });

  it('U11 Aid Engine Move stops if the game ended, otherwise the engine replies', async () => {
    const over: GameStatus = { state: 'checkmate', winner: 'white' };
    routes['POST /api/games/g1/aid-move'] = () => ({ json: engineResponse(view({ toMove: 'black', status: over })) });
    const user = userEvent.setup();
    render(<App />);
    await ready();
    await user.click(screen.getByRole('button', { name: 'Aid Engine Move' }));
    await waitFor(() => expect(screen.getByTestId('game-status')).toHaveTextContent('Check Mate [White] wins!!'));
    expect(called('POST /api/games/g1/engine-move')).toHaveLength(0);
  });

  it('Aid Engine Move gets a reply when the game continues', async () => {
    routes['POST /api/games/g1/aid-move'] = () => ({ json: engineResponse(view({ toMove: 'black' })) });
    routes['POST /api/games/g1/engine-move'] = () => ({ json: engineResponse(view({ pgn: ['1. e4 e5'] })) });
    const user = userEvent.setup();
    render(<App />);
    await ready();
    await user.click(screen.getByRole('button', { name: 'Aid Engine Move' }));
    await waitFor(() => expect(screen.getByTestId('move-list')).toHaveTextContent('1. e4 e5'));
  });

  it('a lost game gets an explanation and a new game', async () => {
    routes['POST /api/games/g1/undo'] = () => errorResponse(404, 'GameNotFound', 'gone');
    const user = userEvent.setup();
    render(<App />);
    await ready();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('This game no longer exists');
    await user.click(within(dialog).getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(called('POST /api/games')).toHaveLength(2));
  });
});

describe('Create Board', () => {
  it('does nothing with an empty box', async () => {
    const user = userEvent.setup();
    render(<App />);
    await ready();
    await user.click(screen.getByRole('button', { name: 'Create Board' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('U3 asks first, then replaces the game and everything shown', async () => {
    const user = userEvent.setup();
    routes['POST /api/games'] = (body) => ({
      status: 201,
      json: (body as { fen?: string }).fen
        ? view({ id: 'g2', fen: 'new-fen', toMove: 'black', humanColor: 'black', engineColor: 'white', pgn: [] })
        : view({ pgn: ['1. e4 e5'] }),
    });
    render(<App />);
    await ready();
    await user.type(screen.getByLabelText('Move/FEN:'), 'some-fen');
    await user.click(screen.getByRole('button', { name: 'Create Board' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Current board will be lost! Continue?');
    await user.click(within(dialog).getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(screen.getByTestId('to-move')).toHaveTextContent('Black'));
    expect(screen.getByTestId('move-list')).toHaveTextContent('');
    expect(screen.getByRole('grid')).toHaveAttribute('data-view', 'black');
    expect(screen.getByLabelText('Move/FEN:')).toHaveValue('');
    expect(called('POST /api/games').at(-1)?.body).toEqual({ fen: 'some-fen' });
  });

  it('Cancel keeps the current game', async () => {
    const user = userEvent.setup();
    render(<App />);
    await ready();
    await user.type(screen.getByLabelText('Move/FEN:'), 'some-fen');
    await user.click(screen.getByRole('button', { name: 'Create Board' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(called('POST /api/games')).toHaveLength(1);
    expect(screen.getByLabelText('Move/FEN:')).toHaveValue('some-fen');
  });

  it('an invalid FEN shows the original message and keeps the game', async () => {
    const user = userEvent.setup();
    render(<App />);
    await ready();
    routes['POST /api/games'] = () => errorResponse(400, 'InvalidFen', 'expected 8 ranks');
    await user.type(screen.getByLabelText('Move/FEN:'), 'bad');
    await user.click(screen.getByRole('button', { name: 'Create Board' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'OK' }));
    const error = await screen.findByText('Error while creating board from FEN: expected 8 ranks');
    expect(error).toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'OK' }));
    expect(called('DELETE /api/games/g1')).toHaveLength(0);
  });
});

describe('Play Black', () => {
  it('U2 asks first, flips the board, and the labels are right after the engine moves', async () => {
    routes['POST /api/games'] = (body) => ({
      status: 201,
      json: (body as { humanColor?: Color }).humanColor === 'black'
        ? view({ id: 'g2', humanColor: 'black', engineColor: 'white' })
        : view(),
    });
    routes['POST /api/games/g2/engine-move'] = () => ({
      json: engineResponse(view({
        id: 'g2',
        humanColor: 'black',
        engineColor: 'white',
        toMove: 'black',
        pgn: ['1. e4'],
        lastMove: { from: 'e2', to: 'e4', san: 'e4', color: 'white' },
      })),
    });
    const user = userEvent.setup();
    render(<App />);
    await ready();
    await user.click(screen.getByRole('button', { name: 'Play Black' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('This will reset the current game');
    await user.click(within(dialog).getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(screen.getByTestId('move-list')).toHaveTextContent('1. e4'));
    expect(screen.getByTestId('to-move')).toHaveTextContent('Black');
    expect(screen.getByRole('grid')).toHaveAttribute('data-view', 'black');
  });
});

describe('board clicks', () => {
  it('U5 sends from and to squares, then clears the selection', async () => {
    routes['POST /api/games/g1/moves'] = () => ({ json: view({ toMove: 'black' }) });
    routes['POST /api/games/g1/engine-move'] = () => ({ json: engineResponse(view()) });
    const user = userEvent.setup();
    render(<App />);
    await ready();
    await user.click(square('b1'));
    expect(square('b1')).toHaveClass('highlight');
    await user.click(square('c3'));
    await waitFor(() => expect(called('POST /api/games/g1/moves')).toHaveLength(1));
    expect(called('POST /api/games/g1/moves')[0].body).toEqual({ from: 'b1', to: 'c3' });
    await waitFor(() => expect(square('b1')).not.toHaveClass('highlight'));
  });

  it('U4 clicking an empty or enemy square with nothing selected does nothing', async () => {
    routes['POST /api/games/g1/moves'] = () => ({ json: view({ toMove: 'black' }) });
    routes['POST /api/games/g1/engine-move'] = () => ({
      json: engineResponse(view({ lastMove: { from: 'e7', to: 'e5', san: 'e5', color: 'black' } })),
    });
    const user = userEvent.setup();
    render(<App />);
    await ready();
    await user.type(screen.getByLabelText('Move/FEN:'), 'e4{Enter}');
    await waitFor(() => expect(square('e7')).toHaveClass('highlight'));
    await user.click(square('d4'));
    await user.click(square('a7'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(called('POST /api/games/g1/moves')).toHaveLength(1);
  });

  it('a click replaces the selection when it lands on another own piece', async () => {
    const user = userEvent.setup();
    render(<App />);
    await ready();
    await user.click(square('b1'));
    await user.click(square('g1'));
    expect(square('b1')).not.toHaveClass('highlight');
    expect(square('g1')).toHaveClass('highlight');
  });

  it('a failed click move keeps the selection', async () => {
    routes['POST /api/games/g1/moves'] = () => errorResponse(422, 'NoPieceInRange');
    const user = userEvent.setup();
    render(<App />);
    await ready();
    await user.click(square('b1'));
    await user.click(square('b5'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Move error: White cannot make move: b1b5, reason: NoPieceInRange');
    await user.click(within(dialog).getByRole('button', { name: 'OK' }));
    expect(square('b1')).toHaveClass('highlight');
  });

  it('U6 a pawn reaching the last rank opens the promotion picker', async () => {
    const board = [...START];
    board[48] = 'wp'; // White pawn on a7.
    board[56] = null;
    routes['POST /api/games'] = () => ({ status: 201, json: view({ board }) });
    routes['POST /api/games/g1/moves'] = () => ({ json: view({ board, status: { state: 'stalemate' } }) });
    const user = userEvent.setup();
    render(<App />);
    await ready();
    await user.click(square('a7'));
    await user.click(square('a8'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Knight' }));
    await waitFor(() => expect(called('POST /api/games/g1/moves')).toHaveLength(1));
    expect(called('POST /api/games/g1/moves')[0].body).toEqual({ from: 'a7', to: 'a8', promotion: 'N' });
  });

  it('U7 clicks follow the displayed orientation', async () => {
    const user = userEvent.setup();
    render(<App />);
    await ready();
    await user.click(screen.getByRole('button', { name: 'View from Black' }));
    const top = document.querySelectorAll('[data-square]')[0];
    expect(top).toHaveAttribute('data-square', 'h1');
    await user.click(top);
    expect(square('h1')).toHaveClass('highlight');
  });

  it('ignores clicks when it is not the human\'s turn or the game is over', async () => {
    routes['POST /api/games'] = () => ({ status: 201, json: view({ status: { state: 'stalemate' } }) });
    const user = userEvent.setup();
    render(<App />);
    await ready();
    await user.click(square('b1'));
    expect(square('b1')).not.toHaveClass('highlight');
  });
});

describe('reload protection (D6)', () => {
  const inProgress = (over: Partial<GameView> = {}): GameView => view({ pgn: ['1. e4 e5'], ...over });
  const pressF5 = (): boolean => fireEvent.keyDown(window, { key: 'F5' });

  it.each([
    ['F5', { key: 'F5' }],
    ['Ctrl+R', { key: 'r', ctrlKey: true }],
    ['Ctrl+Shift+R', { key: 'R', ctrlKey: true, shiftKey: true }],
    ['Cmd+R', { key: 'r', metaKey: true }],
  ])('%s is blocked with the application popup during a game', async (_name, keys) => {
    routes['POST /api/games'] = () => ({ status: 201, json: inProgress() });
    const reload = vi.spyOn(browser, 'reload').mockImplementation(() => {});
    render(<App />);
    await ready();
    expect(fireEvent.keyDown(window, keys)).toBe(false); // false means preventDefault was called.
    expect(await screen.findByRole('dialog')).toHaveTextContent('Reloading will lose the current game');
    expect(reload).not.toHaveBeenCalled();
    reload.mockRestore();
  });

  it('confirming discards the game and reloads', async () => {
    routes['POST /api/games'] = () => ({ status: 201, json: inProgress() });
    const reload = vi.spyOn(browser, 'reload').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<App />);
    await ready();
    pressF5();
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(called('DELETE /api/games/g1')).toHaveLength(1);
    expect(browser.loadGameId()).toBeNull();
    reload.mockRestore();
  });

  it('cancelling keeps the game', async () => {
    routes['POST /api/games'] = () => ({ status: 201, json: inProgress() });
    const reload = vi.spyOn(browser, 'reload').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<App />);
    await ready();
    pressF5();
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Keep playing' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    expect(called('DELETE /api/games/g1')).toHaveLength(0);
    reload.mockRestore();
  });

  it.each([
    ['no moves have been played', view()],
    ['the game is over', inProgress({ status: { state: 'checkmate', winner: 'white' } })],
  ])('does not block when %s', async (_name, game) => {
    routes['POST /api/games'] = () => ({ status: 201, json: game });
    render(<App />);
    await ready();
    expect(pressF5()).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('blocks a custom position with no moves yet', async () => {
    routes['POST /api/games'] = () => ({ status: 201, json: view({ fen: '7k/8/8/8/8/8/2R5/K7 w - - 0 1' }) });
    render(<App />);
    await ready();
    expect(pressF5()).toBe(false);
  });

  it('after a toolbar reload, offers to keep the game', async () => {
    sessionStorage.setItem('cach.gameId', 'g1');
    routes['GET /api/games/g1'] = () => ({ json: inProgress({ humanColor: 'black', engineColor: 'white', toMove: 'black' }) });
    const user = userEvent.setup();
    render(<App />);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('The page was reloaded during a game');
    await user.click(within(dialog).getByRole('button', { name: 'Keep playing' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move' })).toBeEnabled());
    expect(screen.getByTestId('move-list')).toHaveTextContent('1. e4 e5');
    expect(screen.getByRole('grid')).toHaveAttribute('data-view', 'black');
    expect(called('POST /api/games')).toHaveLength(0);
  });

  it('after a toolbar reload, Start new game replaces it as White', async () => {
    sessionStorage.setItem('cach.gameId', 'g1');
    routes['GET /api/games/g1'] = () => ({ json: inProgress() });
    routes['POST /api/games'] = () => ({ status: 201, json: view({ id: 'g2' }) });
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Start new game' }));
    await waitFor(() => expect(browser.loadGameId()).toBe('g2'));
    expect(screen.getByTestId('move-list')).toHaveTextContent('');
    expect(called('POST /api/games').at(-1)?.body).toEqual({});
    expect(called('DELETE /api/games/g1')).toHaveLength(1);
  });

  it('keeping the game gets the engine reply still owed, waiting out a running search', async () => {
    sessionStorage.setItem('cach.gameId', 'g1');
    routes['GET /api/games/g1'] = () => ({ json: inProgress({ toMove: 'black' }) });
    let attempts = 0;
    routes['POST /api/games/g1/engine-move'] = () => {
      attempts++;
      return attempts === 1
        ? errorResponse(409, 'GameBusy')
        : { json: engineResponse(inProgress({ pgn: ['1. e4 e5', '2. Nf3 Nc6'] })) };
    };
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Keep playing' }));
    await waitFor(() => expect(screen.getByTestId('move-list')).toHaveTextContent('2. Nf3 Nc6'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([
    ['a game the server no longer has', () => errorResponse(404, 'GameNotFound')],
    ['a finished game', () => ({ json: view({ pgn: ['1. e4'], status: { state: 'stalemate' } }) })],
  ])('asks nothing after a reload with %s', async (_name, handler) => {
    sessionStorage.setItem('cach.gameId', 'g1');
    routes['GET /api/games/g1'] = handler as Handler;
    render(<App />);
    await ready();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(called('POST /api/games')).toHaveLength(1);
  });
});

describe('Always show current view', () => {
  it('unchecked, the board follows the side to move', async () => {
    routes['POST /api/games/g1/moves'] = () => ({ json: view({ toMove: 'black', status: { state: 'stalemate' } }) });
    const user = userEvent.setup();
    render(<App />);
    await ready();
    await user.click(screen.getByRole('checkbox', { name: 'Always show current view' }));
    expect(screen.getByRole('grid')).toHaveAttribute('data-view', 'white');
    await user.type(screen.getByLabelText('Move/FEN:'), 'e4{Enter}');
    await waitFor(() => expect(screen.getByRole('grid')).toHaveAttribute('data-view', 'black'));
  });
});
