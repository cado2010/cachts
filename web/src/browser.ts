// Browser features behind the reload protection (design 10.7). Storage can be unavailable, in which
// case a reload simply starts a new game.
const GAME_ID_KEY = 'cach.gameId';

/** Provided by the desktop app's preload script. Absent in a browser. */
export interface CachDesktop {
  /** Asks the page before the window closes. Returns a function that stops asking. */
  onCloseRequested(handler: () => void): () => void;
  confirmClose(): void;
}

declare global {
  interface Window {
    cachDesktop?: CachDesktop;
  }
}

export const browser = {
  loadGameId(): string | null {
    try {
      return sessionStorage.getItem(GAME_ID_KEY);
    } catch {
      return null;
    }
  },
  saveGameId(id: string): void {
    try {
      sessionStorage.setItem(GAME_ID_KEY, id);
    } catch {
      // Nothing to do: see above.
    }
  },
  clearGameId(): void {
    try {
      sessionStorage.removeItem(GAME_ID_KEY);
    } catch {
      // Nothing to do: see above.
    }
  },
  reload(): void {
    window.location.reload();
  },
};

/** F5, Ctrl+F5, Shift+F5, Ctrl+R, Ctrl+Shift+R, and the Cmd equivalents. */
export const isReloadShortcut = (e: KeyboardEvent): boolean =>
  e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r');
