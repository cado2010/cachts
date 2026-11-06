# Cach TS

The Cach chess application in TypeScript: an Express API containing the rules, search engine and opening book, and a React UI for playing against it.

It's converted from the C# app in `C:\dev\cach`, with that app's bugs fixed. [`doc/cachts_design.md`](doc/cachts_design.md) covers the design decisions and lists every bug fixed.

## Requirements

Node 24 or later. The API runs TypeScript directly, so it has no build step.

## Running

```
npm install
npm run dev
```

Open http://localhost:5173. The API runs on port 3001, and Vite forwards `/api` to it.

To run the production build, with Express serving the UI at http://127.0.0.1:3001:

```
npm run build
npm start
```

## Desktop app

The Electron shell runs Cach in its own window and starts the server for you, so you don't need `npm run dev` or a browser:

```
npm install
npm run desktop
```

`yarn desktop` also works. The first run downloads Electron.

To start it from any folder with the `cachts` command, run `npm link` once in this folder.

The command builds the UI and a bundled copy of the server into `desktop/dist`, then opens the app. When the app starts, it:

1. Picks a free local port, so it can run alongside `npm run dev`.
2. Starts the API as a background process, on `127.0.0.1` only.
3. Waits for the opening book to load, then opens the window.

Closing the window stops the server. Only one copy of the app runs at a time, and launching it again brings the open window forward.

Games are kept in memory, so closing the window ends the game. If a game is in progress, a popup asks you to confirm first. The server log is at `%APPDATA%\Cach\logs\server.log`.

**This is a first draft.** The window has been seen closing by itself during startup in automated runs, and the cause isn't known yet.

`npm run desktop:dist` is set up to build a Windows installer and a portable `.exe` in `desktop/release`, but it hasn't been run yet.

## Playing

Type a move in the **Move/FEN** box and press Enter, or click a piece and then its destination. You play White unless you press **Play Black**.

Reloading during a game shows a popup, so you can't lose the game by accident. If you confirm, a new game starts with you as White. Closing the tab gives no warning.

| Input | Examples |
|---|---|
| Pawn moves | `e4`, `exd5`, `e8=Q` |
| Piece moves | `Nf3`, `Qxe4`, `Nbd2`, `N1d2`, `Nb1d2` |
| Castling | `O-O`, `O-O-O`, or click the king two squares |
| Draw | `(=)` ends the game immediately |
| Resign | `($)` |

To play from a position, paste a FEN into the box and press **Create Board**. You play whichever side is to move in that FEN. **Dump FEN** puts the current position in the box.

## Testing

| Command | What it runs |
|---|---|
| `npm test` | Type checks, then all API and web tests. Takes about 2 minutes, mostly comparing 1,000 random games with `chess.js` |
| `npm run test:e2e` | Browser tests against the real server. Run `npx playwright install chromium` once first |
| `npm run test:desktop` | Builds the desktop app and tests it. Windows open and close on your screen while it runs |
| `npm run bench` | Depth-4 search timings |

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | API port |
| `LOG_LEVEL` | `info` | Log level |
| `CACH_BOOK_PATH` | `data/cach_openingbook.txt` | Opening book location |
| `CACH_SEARCH_WORKERS` | `2` | Search worker threads |
| `CACH_SEARCH_DEPTH` | `4` | Search depth, for testing |

## Layout

| Path | Contents |
|---|---|
| `api/src/core` | Board, move generation, FEN, notation, game |
| `api/src/engine` | Evaluation, search, move preferences, worker pool |
| `api/src/book` | Opening book reader |
| `api/src/http` | Express routes |
| `api/src/render` | Board PNG |
| `api/dev` | Development runner, which restarts the API when its source changes |
| `desktop` | Electron shell: main process, page bridge, build script and tests |
| `bin` | The `cachts` command |
| `web/src` | React UI |
| `shared` | API types, board constants, piece images |
| `data` | Opening book |
| `e2e` | Browser tests |
| `tools/golden-eval` | One-off C# tool that generated the evaluation test fixtures |
