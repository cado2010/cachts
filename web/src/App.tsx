// The main window, replacing cach/MainForm. All chess decisions come from the API. Design section 10.
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { isGameOver, type Color, type GameView, type PromotionLetter } from '@cachts/shared';
import { ApiFailure, api, type MoveInput } from './api.ts';
import { browser, isReloadShortcut } from './browser.ts';
import { Board } from './components/Board.tsx';
import { CapturedPieces } from './components/CapturedPieces.tsx';
import { Dialog, type DialogRequest } from './components/Dialog.tsx';
import {
  afterMove, colorTitle, displayedColor, initialOrientation, isInProgress, other, pressViewButton, setLocked, squareName,
  statusText,
  type OrientationState,
} from './view.ts';

const HEALTH_POLL_MS = 500;
const BUSY_RETRY_MS = 250;
const BUSY_RETRIES = 40;

const delay = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

export function App() {
  const [game, setGame] = useState<GameView | null>(null);
  const [orientation, setOrientation] = useState<OrientationState>(() => initialOrientation());
  const [input, setInput] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [engineFrom, setEngineFrom] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const showMessage = useCallback((title: string, text: string) => new Promise<void>((resolve) => {
    setDialog({ kind: 'message', title, text, resolve: () => { setDialog(null); resolve(); } });
  }), []);
  const askConfirm = useCallback((
    title: string,
    text: string,
    labels: { okLabel?: string; cancelLabel?: string } = {},
  ) => new Promise<boolean>((resolve) => {
    setDialog({ kind: 'confirm', title, text, ...labels, resolve: (ok) => { setDialog(null); resolve(ok); } });
  }), []);
  const askPromotion = useCallback((color: Color) => new Promise<PromotionLetter | null>((resolve) => {
    setDialog({ kind: 'promotion', color, resolve: (piece) => { setDialog(null); resolve(piece); } });
  }), []);

  /** Shows an API failure. A lost game gets its own message and a fresh game (design 10.5). */
  const reportFailure = useCallback(async (e: unknown): Promise<void> => {
    if (e instanceof ApiFailure && e.code === 'GameNotFound') {
      await showMessage('Game not found', 'This game no longer exists, so a new game has been started.');
      setSelected(null);
      setEngineFrom(null);
      setOrientation(initialOrientation());
      try {
        setGame(await api.createGame({}));
      } catch (inner) {
        setStartupError(inner instanceof Error ? inner.message : String(inner));
      }
      return;
    }
    await showMessage('Error', e instanceof Error ? e.message : String(e));
  }, [showMessage]);

  /** Runs a request with controls disabled, restoring them on every outcome (ledger U10). */
  const withBusy = useCallback(async (work: () => Promise<void>): Promise<void> => {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      await reportFailure(e);
    } finally {
      setBusy(false);
      setThinking(false);
      inputRef.current?.focus();
    }
  }, [reportFailure]);

  const engineReply = useCallback(async (id: string): Promise<void> => {
    setThinking(true);
    try {
      const { game: next } = await api.engineMove(id);
      setGame(next);
      setEngineFrom(next.lastMove?.from ?? null);
      setOrientation(afterMove);
    } finally {
      setThinking(false);
    }
  }, []);

  /** Plays the human's move, renders it, then asks for the engine's reply (design section 6). */
  const playHumanMove = useCallback(async (current: GameView, move: MoveInput, label: string): Promise<boolean> => {
    let next: GameView;
    try {
      next = await api.move(current.id, move);
    } catch (e) {
      if (e instanceof ApiFailure && e.code !== 'GameNotFound' && e.code !== 'NetworkError') {
        await showMessage(
          'Move error',
          `Move error: ${colorTitle(current.toMove)} cannot make move: ${label}, reason: ${e.code}`,
        );
        return false;
      }
      throw e;
    }
    setGame(next);
    setSelected(null);
    setEngineFrom(null);
    setOrientation(afterMove);
    if (!isGameOver(next.status) && next.toMove === next.engineColor) await engineReply(next.id);
    return true;
  }, [engineReply, showMessage]);

  /** After a reload the engine's reply may be missing or still running on the server. */
  const finishEngineTurn = useCallback(async (id: string): Promise<void> => {
    for (let attempt = 0; attempt < BUSY_RETRIES; attempt++) {
      const current = await api.getGame(id);
      setGame(current);
      if (isGameOver(current.status) || current.toMove !== current.engineColor) return;
      try {
        await engineReply(id);
        return;
      } catch (e) {
        if (!(e instanceof ApiFailure && e.code === 'GameBusy')) throw e;
        await delay(BUSY_RETRY_MS);
      }
    }
  }, [engineReply]);

  /** Returns the game from before a reload, if the server still has it. */
  const findPreviousGame = useCallback(async (): Promise<GameView | null> => {
    const id = browser.loadGameId();
    if (!id) return null;
    try {
      return await api.getGame(id);
    } catch (e) {
      if (e instanceof ApiFailure && e.code === 'NetworkError') throw e;
      return null; // Evicted, or the server restarted: there is nothing left to lose.
    }
  }, []);

  // Startup: wait for the book (replaces OpeningMessageForm), then resume or create a game.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const begin = async (): Promise<void> => {
      const previous = await findPreviousGame();
      if (cancelled) return;
      if (previous && isInProgress(previous)) {
        setGame(previous);
        setOrientation(initialOrientation(previous.humanColor));
        if (previous.lastMove?.color === previous.engineColor) setEngineFrom(previous.lastMove.from);
        await withBusy(async () => {
          const startNew = await askConfirm(
            'Game in progress',
            'The page was reloaded during a game. You can keep playing, or start a new game and lose this one.',
            { okLabel: 'Start new game', cancelLabel: 'Keep playing' },
          );
          if (!startNew) {
            await finishEngineTurn(previous.id);
            return;
          }
          void api.deleteGame(previous.id).catch(() => {});
          const created = await api.createGame({});
          setEngineFrom(null);
          setOrientation(initialOrientation());
          setGame(created);
        });
        return;
      }
      if (previous) void api.deleteGame(previous.id).catch(() => {});
      const created = await api.createGame({});
      if (!cancelled) setGame(created);
    };

    const poll = async (): Promise<void> => {
      try {
        const health = await api.health();
        if (cancelled) return;
        if (health.status === 'ready') {
          await begin();
          return;
        }
      } catch {
        // The server may still be starting. Keep polling.
      }
      if (!cancelled) timer = setTimeout(() => void poll(), HEALTH_POLL_MS);
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [askConfirm, findPreviousGame, finishEngineTurn, withBusy]);

  const gameId = game?.id;
  useEffect(() => {
    if (gameId) browser.saveGameId(gameId);
  }, [gameId]);

  // Keyboard reloads are held back behind an application popup (design 10.7).
  const latest = useRef({ game, dialog });
  latest.current = { game, dialog };
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!isReloadShortcut(e)) return;
      const { game: current, dialog: open } = latest.current;
      if (!current || !isInProgress(current)) return;
      e.preventDefault();
      if (open) return;
      void askConfirm(
        'Reload page?',
        'Reloading will lose the current game. Continue?',
        { okLabel: 'Reload', cancelLabel: 'Keep playing' },
      ).then(async (reload) => {
        if (!reload) {
          inputRef.current?.focus();
          return;
        }
        browser.clearGameId();
        await api.deleteGame(current.id).catch(() => {});
        browser.reload();
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [askConfirm]);

  // In the desktop app, closing the window stops the server, so it can lose a game too (design 10.7).
  useEffect(() => {
    const desktop = window.cachDesktop;
    if (!desktop) return;
    return desktop.onCloseRequested(() => {
      const { game: current, dialog: open } = latest.current;
      if (!current || !isInProgress(current)) {
        desktop.confirmClose();
        return;
      }
      if (open) return;
      void askConfirm(
        'Close Cach?',
        'Closing will lose the current game. Continue?',
        { okLabel: 'Close', cancelLabel: 'Keep playing' },
      ).then((close) => {
        if (close) desktop.confirmClose();
        else inputRef.current?.focus();
      });
    });
  }, [askConfirm]);

  const onMove = (e: FormEvent): void => {
    e.preventDefault();
    const text = input.trim();
    if (!game || busy || dialog) return;
    if (text === '') {
      inputRef.current?.focus();
      return;
    }
    setInput('');
    void withBusy(async () => {
      await playHumanMove(game, { move: text }, text);
    });
  };

  const onUndo = (): void => {
    if (!game) return;
    void withBusy(async () => {
      setGame(await api.undo(game.id));
      setSelected(null);
      setEngineFrom(null);
    });
  };

  const onAid = (): void => {
    if (!game) return;
    void withBusy(async () => {
      setThinking(true);
      const { game: next } = await api.aidMove(game.id);
      setGame(next);
      setSelected(null);
      setEngineFrom(null);
      setOrientation(afterMove);
      if (!isGameOver(next.status) && next.toMove === next.engineColor) await engineReply(next.id);
    });
  };

  const startGame = async (body: { fen?: string; humanColor?: Color }): Promise<GameView> => {
    const next = await api.createGame(body);
    if (game) void api.deleteGame(game.id).catch(() => {});
    setGame(next);
    setSelected(null);
    setEngineFrom(null);
    return next;
  };

  const onCreateBoard = (): void => {
    const fen = input.trim();
    if (!game || fen === '') return;
    void withBusy(async () => {
      if (!(await askConfirm('Warning', 'Current board will be lost! Continue?'))) return;
      let next: GameView;
      try {
        next = await startGame({ fen });
      } catch (e) {
        if (e instanceof ApiFailure && e.code === 'InvalidFen') {
          await showMessage('Error', `Error while creating board from FEN: ${e.message}`);
          return;
        }
        throw e;
      }
      setInput('');
      setOrientation(initialOrientation(next.humanColor));
    });
  };

  const onPlayBlack = (): void => {
    if (!game) return;
    void withBusy(async () => {
      if (!(await askConfirm('Play Black', 'This will reset the current game'))) return;
      const next = await startGame({ humanColor: 'black' });
      setOrientation(initialOrientation('black'));
      await engineReply(next.id);
    });
  };

  const onSquareClick = (index: number): void => {
    if (!game || busy || dialog || isGameOver(game.status) || game.toMove !== game.humanColor) return;
    const code = game.board[index];
    const own = game.toMove === 'white' ? 'w' : 'b';
    if (code?.startsWith(own)) {
      setSelected(index);
      return;
    }
    if (selected === null) return;
    const from = squareName(selected);
    const to = squareName(index);
    const reachesLastRank = game.board[selected]?.[1] === 'p' && (index >> 3 === 7 || index >> 3 === 0);
    void withBusy(async () => {
      let promotion: PromotionLetter | undefined;
      if (reachesLastRank) {
        const choice = await askPromotion(game.toMove);
        if (!choice) return;
        promotion = choice;
      }
      await playHumanMove(game, { from, to, promotion }, `${from}${to}${promotion ? `=${promotion}` : ''}`);
    });
  };

  if (startupError) return <main className="splash" role="alert">{startupError}</main>;
  if (!game) return <main className="splash" role="status">Please wait, loading Opening Book ...</main>;

  const view = displayedColor(orientation, game.toMove);
  const controlsDisabled = busy || dialog !== null;

  return (
    <div className="app">
      <header className="app-header"><h1>Cach</h1></header>
      <main className="layout">
        <section className="board-area">
          {/* Each player's captures sit on their side of the board, so they swap when it flips. */}
          <CapturedPieces by={other(view)} pieces={game.captured[other(view)]} position="top" />
          <Board
            game={game}
            view={view}
            selected={selected}
            engineFrom={engineFrom}
            disabled={controlsDisabled}
            onSquareClick={onSquareClick}
          />
          <CapturedPieces by={view} pieces={game.captured[view]} position="bottom" />
        </section>

        <aside className="moves-panel">
          <h2>Moves</h2>
          <ol className="move-list" data-testid="move-list">
            {game.pgn.map((line) => <li key={line}>{line}</li>)}
          </ol>
        </aside>

        <section className="controls">
          <form className="control-row" onSubmit={onMove}>
            <label htmlFor="move-input">Move/FEN:</label>
            <input
              id="move-input"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
            <button type="submit" className="primary" disabled={controlsDisabled}>Move</button>
            <button type="button" onClick={onUndo} disabled={controlsDisabled}>Undo</button>
            <button type="button" onClick={onAid} disabled={controlsDisabled}>Aid Engine Move</button>
          </form>

          <div className="control-row">
            <button type="button" onClick={onCreateBoard} disabled={controlsDisabled}>Create Board</button>
            <span className="button-group">
              <button
                type="button"
                aria-label="View from White"
                onClick={() => setOrientation((s) => pressViewButton(s, 'white'))}
              >
                W
              </button>
              <button
                type="button"
                aria-label="View from Black"
                onClick={() => setOrientation((s) => pressViewButton(s, 'black'))}
              >
                B
              </button>
            </span>
            <button type="button" onClick={onPlayBlack} disabled={controlsDisabled}>Play Black</button>
            <button type="button" onClick={() => setInput(game.fen)} disabled={dialog !== null}>Dump FEN</button>
          </div>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={orientation.locked}
              onChange={(e) => {
                const locked = e.target.checked;
                setOrientation((s) => setLocked(s, locked, game.toMove));
              }}
            />
            Always show current view
          </label>

          <dl className="status">
            <div>
              <dt>To Move:</dt>
              <dd data-testid="to-move">{colorTitle(game.toMove)}</dd>
            </div>
            <div>
              <dt>Game:</dt>
              <dd data-testid="game-status">{statusText(game.status)}</dd>
            </div>
            {thinking && <div className="thinking" role="status">Cach is thinking…</div>}
          </dl>
        </section>
      </main>
      {dialog && <Dialog request={dialog} />}
    </div>
  );
}
