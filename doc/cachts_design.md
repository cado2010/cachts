# Cach TS: Design Document

| | |
|---|---|
| **Status** | Built. Choices D1-D6 await review |
| **Date** | 2026-11-06 |
| **Source** | `C:\dev\cach` (C#, .NET Framework 4.5.2, WinForms) |
| **Target** | `C:\dev\cachts` (TypeScript, Node, Express, React) |

## 1. Summary

Cach TS converts the Cach chess application into two TypeScript apps:

- **`api/`** is an Express API containing the rules, search engine and opening book reader. It owns all game state.
- **`web/`** is a React app with the same controls as the WinForms window. It contains no chess rules and does everything through the API.

The port **corrects the original's bugs** rather than reproducing them. It keeps the original's notation, messages, controls, evaluation tuning, search depth, move preferences and opening book. Section 3 gives the exact boundary, and section 4 lists every bug being fixed.

## 2. Decisions

The original brief asked for exact behaviour. Analysis found that "exact" would include real chess-rule violations, so the question went back to the product owner. These answers take precedence over the brief where they differ.

| Topic | Decision |
|---|---|
| Bugs | Fix them all: correct chess rules and a correct UI |
| Engine scope | Fix errors, keep style. No transposition table, quiescence search or iterative deepening |
| Draw rules | Add **insufficient material** and **threefold repetition**, both automatic. No 50-move rule |
| Undo | Takes back the player's whole turn: the engine's reply and their own move |
| Hosting | Local, multiple in-memory games keyed by ID. No login or persistence |
| UI look | Same controls and behaviour with a modern look. Not a pixel replica |
| Extra scope | Add a board PNG endpoint. No opening book builder and no Telegram bot |

### Design choices

The decisions above didn't settle these, so they were proposed and then accepted at review, with D6 revised.

| # | Choice | Reasoning |
|---|---|---|
| D1 | After **Create Board**, the human plays the side to move in the FEN | The original always let the human move first after Create Board. This keeps that, and it makes black-to-move FENs work |
| D2 | **Mate scoring prefers the fastest mate** | Without draw-by-repetition, a winning engine choosing randomly among equal mates could otherwise dither indefinitely |
| D3 | **Search considers all four promotion pieces** | The original searched queen promotions only, so a knight promotion that mates was invisible to it |
| D4 | **Enter submits the Move box** | WinForms had no default button, so Enter did nothing. That reads as a defect in a web form |
| D5 | **`(=)` and `($)` keep working** as immediate draw and resign commands | They're part of the original input language. The draw needs no acceptance, as in the original |
| D6 | **Reloading the page starts a new game as White, but a game in progress is protected by an application popup** (section 10.7) | The original has no way back from Play Black except restarting the app. Reloading is the web equivalent, so no new control is added. Revised at review so a reload can't lose a game by accident |

## 3. What stays and what changes

### Stays the same

- **Controls and labels:** Move/FEN box, Move, Undo, Aid Engine Move, Create Board, W, B, Play Black, Dump FEN, "Always show current view", To Move, Game, move list.
- **Message wording:** for example `Move error: White cannot make move: Nf9, reason: InvalidFormat`, `Current board will be lost! Continue?`, `Please wait, loading Opening Book ...`.
- **Input notation:** the lenient grammar in section 7.3, including case-insensitive piece letters and full-square forms like `Nb1d2`.
- **Error codes:** the `MoveErrorType` names.
- **Evaluation tuning:** piece values, all piece-square tables, the ±450 check adjustment.
- **Search depth:** fixed at 4 plies.
- **Move preferences:** no early king, rook or queen moves, and captures preferred among equal moves.
- **Move choice:** uniformly random among the final candidates.
- **Opening book:** same data file, same 20-ply limit, same uniform random choice among known replies (not weighted by popularity).
- **Board appearance:** the original piece images, square colours (SaddleBrown and SandyBrown), coordinates on all four sides.

### Changes

- Everything in section 4.
- Insufficient material and threefold repetition end the game.
- Undo takes back a whole turn.
- Engine thinking no longer freezes the UI.
- Shell styling and dialogs are modernized, and the layout adapts to window size.
- The move list shows standard notation, so typed `E4` or `Ng1f3` appears as `e4` or `Nf3`, and castling as `O-O`.

### Out of scope

- Opening book builder, including `BuildFromPGN`, `Write` and `PGNMultiGameParser`
- `cachBot` (Telegram)
- `Board.WriteToFile`, used only by tests (`ReadFromFile` is unimplemented in the original)
- The 50-move rule
- Login and persistence
- Move hints, drag and drop, and animations

## 4. Bug ledger

Every entry gets a regression test named with its ID. The **Evidence** column shows how each one was established:

- **Ran:** reproduced by running the original compiled DLLs in a scratch harness.
- **Read:** established by reading the source, not executed.
- **Data:** found by scanning the book file.

Paths are relative to `C:\dev\cach\src`.

### Rules

| ID | Original behaviour | Source | Evidence | Fix |
|---|---|---|---|---|
| R1 | A pawn captured en passant stays on its square as a dead piece, still drawn and still in the FEN | `cachCore/models/Board.cs:913-940, 1108-1117` | Ran | Remove the captured pawn |
| R2 | The side that didn't just move is also tested, so a player with no moves is called stalemated on their opponent's turn | `Board.cs:617-646` | Ran: `k7/8/p7/8/P7/8/5q2/7K`, after `a5` | Test only the side to move |
| R3 | Checkmate is missed when the only capture of the attacker is by a pinned piece, leaving a player with no legal move in an unfinished game | `rules/InMateHelper.cs:82-118` | Ran: `6k1/6pp/8/3b2N1/8/R7/B7/6K1`, after `Ra8` | Derive mate and stalemate from the legal move list |
| R4 | Stalemate is missed when the only "movable" piece is pinned | `InMateHelper.cs:221-241` | Read | Same as R3 |
| R5 | Double check is analysed using the first attacker found, so capturing it counts as an escape | `InCheckHelper.cs`, `InMateHelper.cs:82-118` | Read | Same as R3 |
| R6 | A full-square move skips the colour and piece checks, so Black's `Ng1f3` moves White's knight | `Board.cs:835-838` | Ran | Match only the mover's own pieces of the stated type |
| R7 | A full-square move from an empty square throws `NullReferenceException` | `Board.cs:837, 413` | Ran: `Qd4d5` | Return `NoSuchPiece` |
| R8 | Typing `O-O` doesn't count as castled, only `o-o` does | `models/BoardHistory.cs:222` | Ran | Track castling on the structured move |
| R9 | FEN side to move, castling rights and en passant are ignored on import | `utils/FENSerializer.cs:28-68` | Ran for side to move, Read for the others | Parse and honour them |
| R10 | FEN export writes "can castle right now" instead of rights, so the start position exports `- -`. En passant is always `-` and clocks are missing | `FENSerializer.cs:112-124` | Ran | Export a correct 6-field FEN |
| R11 | Pieces from FEN count as never moved, so a king on d1 can castle | `CastleAttemptValidationHelper.cs:58-120` | Ran | Rights require king and rook on their home squares |
| R12 | A FEN with no king is accepted, and Dump FEN or search then throws `ArgumentOutOfRangeException` | `Board.cs:141, 600-612` | Ran | Reject invalid positions (section 7.2) |
| R13 | Castling doesn't clear the en passant square, so it can survive into a later turn | `Board.cs:1034-1037` | Read | Clear it on every move |
| R14 | Undoing a promotion doesn't restore the en passant square | `Board.cs:943-950, 1169-1175` | Read | Undo restores complete prior state |
| R15 | Resign and draw flags survive Undo, so the game stays over | `Board.cs:370, 378, 484-494` | Ran | Undo clears the result (section 7.7) |
| R16 | Over-long input is silently cut to 6 characters and may then be played | `utils/MoveInputParser.cs:142-147` | Read | Return `InvalidFormat` |
| R17 | Check and annotation suffixes are rejected, so `Nf3+` fails | `MoveInputParser.cs:165-173` | Read | Accept `+ # ! ?` suffixes |
| R18 | The move list numbers from White, which is wrong for black-to-move starts | `BoardHistory.cs:170-194` | Read | Use the FEN's move number and `1... e5` |

### Engine

| ID | Original behaviour | Source | Evidence | Fix |
|---|---|---|---|---|
| E1 | The engine playing White never promotes because it tests `Row == 8`, leaving a pawn on the last rank | `cacheEngine/Engine.cs:243-245` | Ran: `8/P6k/8/8/8/8/8/K7` | Generate promotions correctly |
| E2 | Promotion and move colour use the engine's colour on opponent plies too, so the opponent doesn't promote in search | `Engine.cs:243-250` | Read | Use the moving side |
| E3 | Searching reorders the internal piece lists, so the same position gives different candidates: `a4,c4,d3,e3,h3` then `d3,d4,h3,e3` from the start position | `Board.cs:1116, 1127`, `Engine.cs:167` | Ran | Generate moves from the board in a fixed order (section 7.1) |
| E4 | Root ties are collected from pruned results, whose values are only bounds, so a worse move can appear equal | `Engine.cs:363` | Read | Exact-tie root window (section 8.1) |
| E5 | The endgame test includes the king's 20,000, so it's never true and "endgame" never happens | `BoardEvaluator.cs:238-251` | Read | Exclude kings. Thresholds stay 1500 and 2000 |
| E6 | Stalemate is scored as material, so a winning engine can walk into one | `BoardEvaluator.cs:149-194` | Read | Score draws as 0 |
| E7 | Search never generates opponent castling | `Engine.cs:203` | Read | Generate castling for both sides |
| E8 | En passant isn't flagged as a capture, so the capture preference misses it | `Engine.cs:185` | Read | Flag it as a capture |
| E9 | If the capture preference empties the list, every tied move comes back, ignoring the piece preferences too | `Engine.cs:109, 148-151` | Read | Apply preferences, then captures (section 8.3) |
| E10 | After a cutoff the loop keeps searching captures, then stops at the first non-capture | `Engine.cs:309, 401` | Read | Stop at the cutoff |
| E11 | A book move that fails is ignored, leaving the turn with the engine and no error | `cach/MainForm.cs:165-168` | Read | Only offer book moves that are legal |
| E12 | The book contains 3 `*` PGN result tokens that can be chosen as moves | `cach_openingbook.txt` | Data | Drop them at load (section 9) |
| E13 | Book matching compares raw typed text, so `E4` or `Nb1d2` leaves the book | `Engine.cs:81`, `BoardHistory.cs:196-208` | Read | Compare canonical notation |
| E14 | The book is consulted even on custom FEN boards | `Engine.cs:78-87` | Read | Use the book only for games from the standard start |

### UI

| ID | Original behaviour | Source | Evidence | Fix |
|---|---|---|---|---|
| U1 | Labels aren't refreshed after the engine moves, so To Move names the wrong side and an engine checkmate isn't shown | `MainForm.cs:121, 131-142` | Read | Render every response |
| U2 | Play Black leaves To Move on White and doesn't refresh game status | `MainForm.cs:404-407` | Read | Same as U1 |
| U3 | Create Board keeps the old engines, so they search the old board, and it leaves labels, move list and highlight stale | `MainForm.cs:264-267` | Read | Create a new server game and render it |
| U4 | After the engine moves, clicking anything except your own piece throws a null reference | `MainForm.cs:338-347, 380-383` | Read | Keep selection separate from the last-move highlight |
| U5 | A click needing disambiguation shows an error, then retries. Real failures show two errors | `MainForm.cs:357-365` | Read | Clicks send from and to squares |
| U6 | Click moves can't promote | `MainForm.cs:351-352` | Read | Promotion picker dialog |
| U7 | Click mapping uses the Play Black flag, not the displayed orientation, so clicks land wrongly on a flipped board | `MainForm.cs:299-306` | Read | Map through the displayed orientation |
| U8 | W and B do nothing while "Always show current view" is checked, which is the default | `MainForm.cs:95-96, 236-248` | Read | Section 10.3 |
| U9 | A resignation is labelled `Draw` | `MainForm.cs:212-219` | Ran for the flags, Read for the label | Show who resigned |
| U10 | An exception leaves Move and Aid disabled permanently | `MainForm.cs:104, 148-152` | Read | Restore controls in all cases |
| U11 | Aid Engine Move still attempts the reply when the game has ended, and doesn't refresh status | `MainForm.cs:419-445` | Read | Stop if the game is over, and render every response |
| U12 | Castling and promotion moves get no last-move highlight, because the square is parsed from the move text | `cachRendering/BoardRenderer.cs:104-126` | Read | Use structured from and to squares |
| U13 | The window freezes while the engine thinks | `MainForm.cs:133` | Read | Asynchronous calls with a thinking indicator |
| U14 | Move attempts after game over silently reuse the previous result | `cachCore/models/Game.cs:49-75` | Read | Return `GameOver` and show it |

### Efficiency (no change in behaviour)

- Book memory drops from about 1.8 GB and 5.8s to about 172 MB and 0.65s (measured with a prototype loader).
- Removes the global static `Piece` registry, which never releases pieces (`models/Piece.cs:33`, `EndGame()` is never called).
- Removes per-node search logging and the path strings built for it, which ran at DEBUG level by default.

## 5. Architecture

```
 Browser                        Node process
┌──────────────┐  HTTP/JSON  ┌───────────────────────────────────────┐
│  React app   │────────────▶│  Express routes                       │
│  (no rules)  │◀────────────│    │                                  │
└──────────────┘             │    ▼                                  │
                             │  GameStore (id → Game)                │
                             │    │                                  │
                             │    ├─ core: position, moves, FEN, SAN │
                             │    ├─ OpeningBook (one shared copy)   │
                             │    ▼                                  │
                             │  SearchPool ──▶ worker threads        │
                             │                 (evaluate + search)   │
                             └───────────────────────────────────────┘
```

**Rules and game state stay on the main thread; search runs in workers.** A depth-4 search takes seconds, so running it on the event loop would stall every other request. Workers don't need the book, so it's loaded once.

**Note on server state.** Analysis originally concluded that games had to live on the server because search changed hidden piece-list order. Fixing E3 removes that hidden state, so a position's FEN, plus the earlier positions that could still repeat, now fully determines a search. Games stay on the server by choice: it's the sole authority on rules, and the UI stays free of them. This is also what makes it simple to hand a search to a worker.

### Stack

| Concern | Choice | Reason |
|---|---|---|
| Runtime | Node 24 | Already installed (24.11). Runs TypeScript directly, so API and workers need no build step |
| API | Express 5, zod | Requested; zod validates requests |
| PNG | `@napi-rs/canvas` | Prebuilt Windows binaries, no native toolchain |
| Logging | pino | Structured, and cheap when disabled |
| UI | React 19, Vite | Requested |
| Tests | Vitest, supertest, React Testing Library, Playwright | One runner across packages, plus browser tests |
| Test oracle | `chess.js` (dev dependency only) | Independent rules implementation to compare against |

The engine is a conversion of Cach's own design, so `chess.js` is never used at runtime.

### Repository layout

```
cachts/
├─ package.json              npm workspaces: shared, api, web
├─ tsconfig.base.json
├─ README.md
├─ data/cach_openingbook.txt copied unchanged from the C# repo
├─ doc/cachts_design.md
├─ shared/
│  ├─ assets/pieces/*.png    the 12 original piece images
│  └─ src/                   API types, board colours and sizes
├─ api/
│  ├─ src/
│  │  ├─ core/               position, moves, FEN, notation, game
│  │  ├─ engine/             evaluator, search, filter, worker, pool
│  │  ├─ book/               opening book reader and lookup
│  │  ├─ http/               routes, validation, errors
│  │  ├─ render/             PNG renderer
│  │  ├─ store/              in-memory games
│  │  └─ server.ts
│  ├─ dev/                   development runner for npm run dev
│  └─ test/
├─ web/
│  ├─ src/                   components, state, API client
│  └─ test/
├─ e2e/                      Playwright tests
└─ tools/golden-eval/        one-off C# tool that generated the evaluation fixtures
```

### C# to TypeScript map

| C# | TypeScript | Notes |
|---|---|---|
| `cachCore/models/Board.cs`, `BoardSquare`, `Position`, pieces, `Movement` | `core/position.ts`, `core/moves.ts` | Compact board with make and unmake |
| `BoardHistory`, `BoardHistoryItem`, `BoardStatus` | `core/position.ts`, `core/game.ts` | Undo records plus a move list |
| `rules/InCheckHelper`, `InMateHelper`, `CastleAttemptValidationHelper` | `core/moves.ts` | Derived from legal moves (R2-R5) |
| `models/Game`, `controllers/GameController` | `core/game.ts` | |
| `utils/MoveInputParser`, `MoveDescriptor` | `core/notation.ts` | Same grammar, stricter resolution |
| `utils/FENSerializer` | `core/fen.ts` | R9-R12 |
| `utils/PGNParser` | `core/pgn.ts` | Used to load test games |
| `cacheEngine/BoardEvaluator` | `engine/evaluator.ts` | Same values, E5 and E6 fixed |
| `cacheEngine/Engine`, `MoveChoice` | `engine/search.ts`, `engine/filter.ts`, `engine/engineService.ts` | |
| `openingBook/OpeningBookBuilder.Read`, `OpeningBookNode`, `OpeningBookSearch` | `book/openingBook.ts` | Reader only |
| `cachRendering/BoardRenderer.RenderAsImage` | `render/boardImage.ts` | |
| `cachRendering/BoardRenderer.Render` | `web/src/components/Board.tsx` | |
| `cach/MainForm`, `OpeningMessageForm` | `web/src/` | |

## 6. API

The API is JSON under `/api`, and it binds to `127.0.0.1`. Squares are algebraic (`e4`) and colours are `"white"` or `"black"`. In production, Express also serves the built web app from the same origin. In development, Vite proxies `/api`.

| Method and path | Purpose | Replaces |
|---|---|---|
| `GET /api/health` | Readiness and book status | Opening message form |
| `POST /api/games` | Create a game | Startup, Create Board, Play Black |
| `GET /api/games/:id` | Current state | |
| `DELETE /api/games/:id` | Discard a game | |
| `POST /api/games/:id/moves` | Play the human's move | Move button, board clicks |
| `POST /api/games/:id/engine-move` | Engine plays its side | Reply after a human move |
| `POST /api/games/:id/aid-move` | Engine plays the human's side | First half of Aid Engine Move |
| `POST /api/games/:id/undo` | Undo the player's turn | Undo button |
| `GET /api/games/:id/board.png` | Render the board | `RenderAsImage` |

Dump FEN needs no route, because every response includes `fen`.

### Human and engine moves are separate calls

As in the original, the player's move appears before the engine starts thinking. `POST /moves` returns right away, the UI renders it, and the UI then calls `POST /engine-move`.

### Requests

```ts
// POST /api/games: all fields optional
{ fen?: string; humanColor?: Color }
```

- With `fen`: the human plays the FEN's side to move (D1). Supplying `humanColor` as well returns `400`.
- Without `fen`: standard start, and `humanColor` defaults to `white`.
- The engine takes the other colour.

```ts
// POST /api/games/:id/moves: exactly one form
{ move: string }                                  // typed notation
{ from: Square; to: Square; promotion?: 'Q'|'R'|'B'|'N' }  // click
```

```
// GET /api/games/:id/board.png
?view=white|black    default white
&tile=30             20-120; default 30, as in MainForm.cs:86
&border=16           0-40;   default 16, as in MainForm.cs:87
```

### Responses

```ts
interface GameView {
  id: string;
  fen: string;                  // full 6-field FEN
  board: (PieceCode | null)[];  // 64 entries, index 0 = a1, 63 = h8; e.g. "wK", "bp"
  toMove: Color;
  humanColor: Color;
  engineColor: Color;
  status: GameStatus;
  pgn: string[];                // e.g. ["1. e4 e5", "2. Nf3"]
  lastMove: { from: Square; to: Square; san: string; color: Color } | null;
}

type GameStatus =
  | { state: 'active' }
  | { state: 'check'; player: Color }
  | { state: 'checkmate'; winner: Color }
  | { state: 'stalemate' }
  | { state: 'draw'; reason: 'insufficient-material' | 'repetition' | 'agreement' }
  | { state: 'resigned'; winner: Color };

// engine-move and aid-move also return:
interface EngineMoveInfo {
  san: string;
  source: 'book' | 'search';
  value: number | null;   // null for book moves
  candidates: number;     // size of the list the move was picked from
  nodes: number;          // 0 for book moves
  elapsedMs: number;
}
```

### Errors

```ts
{ error: { code: string; message: string } }
```

| HTTP | Codes | When |
|---|---|---|
| 400 | `BadRequest`, `InvalidFen` | Malformed body, query or FEN |
| 404 | `GameNotFound` | Unknown or evicted game |
| 409 | `GameBusy` | A search is running for this game |
| 409 | `NotYourTurn` | It isn't that side's turn |
| 422 | `InvalidFormat`, `NoSuchPiece`, `MoreThanOnePieceInRange`, `NoPieceInRange`, `KingInCheck`, `InvalidKill`, `InvalidCastle`, `GameOver` | The move was rejected. Names as in the C# `MoveErrorType` |
| 503 | `BookLoading` | Game creation before the book is ready |
| 500 | `InternalError` | Unexpected failure, also logged |

`CachError` and `UnknownError` from the C# enum become `InternalError`.

### Concurrency

Each game has one busy flag, held while a search is running. Any mutating request for a busy game gets `409 GameBusy`, and the UI disables those controls so this shouldn't normally occur. The flag is always released, including when a search fails. A game deleted mid-search discards the result.

### Limits

- Bodies are capped at 16 KB.
- At most 100 games: when full, the least recently used game is evicted.
- Games idle for 24 hours are evicted.

## 7. Core rules

### 7.1 Board and moves

The object graph of `Board`, `BoardSquare`, `Piece` and GUIDs becomes a flat 64-entry typed array (`a1` = 0, `h8` = 63) plus side to move, castling rights, en passant square and clocks. `makeMove` and `unmakeMove` keep complete prior state on an undo stack, which fixes R14.

Moves are generated by scanning squares in a **fixed order**. Combined with having no piece lists, this is what fixes E3: the same position always produces the same moves.

Legal moves are pseudo-legal moves that don't leave the mover's king attacked. Check, checkmate, stalemate and castling legality all derive from this one definition, which fixes R2-R5.

### 7.2 FEN

**Import** accepts 1 to 6 space-separated fields, as the original tolerated short FENs:

| Missing field | Default |
|---|---|
| Side to move | `w` |
| Castling | Inferred from kings and rooks on home squares |
| En passant | `-` |
| Halfmove clock | `0` |
| Fullmove number | `1` |

Given castling rights without the matching king and rook at home are dropped, and so is an en passant square with no pawn that could have just moved past it. Import returns `InvalidFen` for:

- Anything other than 8 ranks of 8 squares
- An unknown piece letter
- Not exactly one king per side
- A pawn on rank 1 or 8
- The side not to move being in check

**Export** is always a correct 6-field FEN. The halfmove clock also limits which earlier positions can still repeat. There's no 50-move rule.

### 7.3 Input notation

The grammar matches `MoveInputParser`, so what users could type still works:

| Form | Examples | Notes |
|---|---|---|
| Pawn to square | `e4`, `E4`, `d6` | Also captures: `d5` works from c4 or e4 if exactly one pawn can go there |
| Piece to square | `Nf3`, `nf3`, `Qxe4` | Piece letters are case-insensitive, except that bishop must be capital `B` |
| With file or rank | `Nbd2`, `N1d2`, `exd5` | |
| With full square | `Nb1d2`, `e2e4`, `Qh4xe1` | |
| Promotion | `e8=Q`, `exd8=N` | `=` and the piece are required |
| Castling | `o-o`, `O-O`, `o-o-o`, `O-O-O` | |
| Commands | `(=)`, `($)` | Draw, resign (D5) |
| Suffixes | `Nf3+`, `Qh7#`, `e4!?` | New: ignored when parsing (R17) |

`b` always starts a pawn move, such as `bxc3`, and `B` always starts a bishop move.

### 7.4 Move resolution and errors

The error codes keep their original meanings, and resolution checks them in this order:

| Step | Result |
|---|---|
| Input doesn't parse, is too long, or is a pawn reaching the last rank without promoting | `InvalidFormat` |
| Castling isn't legal | `InvalidCastle` |
| No piece of the mover's colour matches the type and start hints | `NoSuchPiece` |
| None of those pieces can pseudo-legally reach the target | `NoPieceInRange` |
| Several can reach it, and more than one is legal | `MoreThanOnePieceInRange` |
| Input has `x` but the move captures nothing | `InvalidKill` |
| Pieces can reach it, but all leave the king attacked | `KingInCheck` |
| Exactly one legal move remains | Move played |

A capture typed without `x` is still accepted. A pinned piece no longer makes a move ambiguous, so `Ne2` plays when the other knight is pinned. That's a correction over the original, which rejected it, and it's also needed for standard notation to resolve.

Click moves use the same pipeline with the from and to squares supplied, and they accept the standard king-moves-two-squares gesture as castling.

### 7.5 Game end

After each move:

| Condition (for the side to move) | Status |
|---|---|
| No legal moves, in check | `checkmate` |
| No legal moves, not in check | `stalemate` |
| Insufficient material | `draw` / `insufficient-material` |
| The same position has occurred for the third time | `draw` / `repetition` |
| In check | `check` |

**Insufficient material** means K v K, K+N v K, or kings plus any number of bishops all on the same square colour. This matches the `chess.js` definition, so the two can be compared directly in testing.

**Threefold repetition** ends the game automatically on the third occurrence, with no claim needed. Positions match when they have the same pieces, side to move, castling rights and en passant possibility. An en passant square only counts when a legal capture exists. Occurrences needn't be consecutive, and only positions since the last pawn move or capture are considered.

### 7.6 Notation output

All recorded moves use canonical standard notation, with legal-move disambiguation, `O-O`, `=Q`, and `+` or `#`. For book lookup, the suffix is dropped. A scan of the whole book with `chess.js` found that all 1,027,014 real moves are already in this exact form, so canonical matching needs no translation table.

### 7.7 Undo

Undo works on whole turns:

| Situation | What Undo does |
|---|---|
| Game ended by `(=)` or `($)` | Clears the result only. No move is removed |
| Last move was the engine's, with a human move before it | Removes both |
| Last move was the human's | Removes it |
| Only engine moves on record (Play Black, first move) | Nothing, because the engine would just move again |
| No moves | Nothing |

Moves played by Aid Engine Move count as the human's. Undo works after checkmate and stalemate, and it returns the game to active. As in the original, undoing at the start isn't an error.

## 8. Engine

### 8.1 Search

The search is minimax with alpha-beta pruning at a fixed depth of 4, from the engine's point of view. Compared with the original, pruning is now standard (E10), all legal moves are generated for both sides (E2, E7), and captures are searched first, followed by quiet moves and then castling. Move ordering affects speed only.

**Exact root ties (E4).** The original collected ties from pruned results, whose values are only bounds. Here, each root move is searched with `alpha = best - 1`:

```
best = -∞, candidates = []
for each legal root move m, in fixed order:
    make(m)
    v = search(depth - 1, alpha = best - 1, beta = +∞, minimizing)
    unmake(m)
    if v > best:   best = v; candidates = [m]
    elif v == best: candidates.push(m)
```

Any value equal to `best` is above the window's lower bound, so it's an exact score rather than a bound. Ties are therefore real, and the candidate set doesn't depend on move order.

### 8.2 Evaluation

The values are copied exactly from `BoardEvaluator.cs`:

- **Pieces:** K 20000, Q 900, R 500, B 330, N 320, P 100
- **Square tables:** all six White tables, with Black's mirrored by rank
- **Check:** −450 if the engine's king is in check, otherwise +450 if the opponent's is

Terminal positions:

| Position | Score |
|---|---|
| Checkmate | `±(30000 + 20000 × remainingDepth)` plus material and the check adjustment |
| Stalemate | 0 (E6) |
| Insufficient material | 0 |
| Third occurrence of a position | 0 |

The `remainingDepth` term is D2. The original's base of ±30000 stays. The 20000 step is larger than any realistic material swing between two mating lines, so a faster mate always wins. Mate and stalemate are detected at leaf nodes too, as in the original.

### 8.3 Choosing among equal moves

This is the original `FilterMoves` policy with E9 fixed. Starting from the exact-tie candidates:

1. Drop any move that breaks a preference, unless that would leave nothing:
   - King moves, unless it's the endgame
   - Rook moves, unless this side has castled
   - Queen moves, unless it's the middlegame

   Castling moves are exempt, as in the original.
2. If any remaining move is a capture, including en passant, keep only captures.
3. The caller picks uniformly at random from what's left.

**Game stage definitions:**

- **Endgame:** with kings excluded (E5), `(white < 1500 and black < 2000) or (black < 1500 and white < 2000)`.
- **Middlegame:** at least 2 minor-piece moves and 3 pawn moves by each side across the game so far, and not the endgame. The original's code comment says 3 and 4, but its code uses 2 and 3. The code is what has actually shaped its play, so it stays.

### 8.4 Choosing a move

```
engineMove(game, side):
    if game is over → GameOver
    if side isn't to move → NotYourTurn
    if game began from the standard start and history < 20 plies:
        replies = book.lookup(history) filtered to legal moves
        if any → play a uniformly random one (source: book)
    result = await searchPool.run(snapshot)
    candidates = applyPreferences(result)
    play a uniformly random candidate (source: search)
```

The random source is injectable so tests can make choices repeatable.

### 8.5 Worker threads

Search runs in a small pool of `worker_threads`, sized by `CACH_SEARCH_WORKERS` (default 2), with extra requests queued. A request carries the FEN and the repetition keys of the positions since the last irreversible move, which is all a search needs. So a winning engine avoids allowing a third occurrence, and a losing one aims for it. To keep this cheap, search only computes keys when the halfmove clock is at least 8, since a third occurrence can't happen sooner. Preferences are applied on the main thread, which knows the game's history.

### 8.6 Performance target

Depth-4 search must be no slower than the C# baseline measured on this machine with logging off: **about 1.5s from the start position, and about 5.0s** on `r1bqkb1r/pp3ppp/2n1pn2/2pp4/3P4/2N1PN2/PPP1BPPP/R1BQK2R` with Black to search. The exact-tie root window costs some extra nodes, and the compact board should more than repay them. `npm run bench` reports the actual numbers.

**Measured:** about 50 ms from the start position (7,829 nodes) and about 75 ms in that middlegame (25,693 nodes), over three runs on the same machine. Across 642 search moves in six full games through the live server, the median was 22 ms, the 95th percentile 108 ms and the maximum 324 ms. The alpha-beta versus minimax tests confirm the speed isn't coming from pruning away valid results.

## 9. Opening book

The file format is unchanged and read in the same pre-order: `<childCount>||<ply>||<variationName>`, one node per line.

Measured facts about the file:

| Fact | Value |
|---|---|
| Size | 10.26 MB, 1,027,018 lines |
| Depth | 20 plies |
| Most replies at a node | 16 |
| Variation names | None present |
| Duplicates after suffix removal | None |
| Illegal entries | 3, all `*` (E12) |
| Non-canonical moves | None |

**Loader:**

- Strips annotations using the original `FixPly` logic.
- Skips `*` nodes.
- Builds child maps only on nodes that have children. That lazy allocation accounts for much of the memory saving over C#, which pre-sized a 50-entry dictionary on all 1M nodes.
- Iterative parsing is unnecessary at a maximum depth of 20, so recursion stays, matching the original.
- Loads once at startup, before the server reports ready. A prototype took about 0.65s and 172 MB.

**Lookup** matches the original `OpeningBookSearch`: returns nothing at 20 or more plies, or when the game has left the book. Otherwise it returns the children of the matched node in file order.

A missing or corrupt book file stops startup with a clear error. The original would also fail at startup. A chess engine that silently loses its book is harder to notice than one that refuses to start.

## 10. Web UI

### 10.1 Layout

Same controls, modern styling, and the board scales to the available space. Below about 900px wide, the move list moves under the board.

```
┌───────────────────────────────────────────────────────────────┐
│ Cach                                                          │
├───────────────────────────────────────┬───────────────────────┤
│   a  b  c  d  e  f  g  h              │ Moves                 │
│ 8 ┌───────────────────────┐ 8         │ 1. e4 e5              │
│   │                       │           │ 2. Nf3 Nc6            │
│   │        board          │           │ 3. Bb5 a6             │
│   │                       │           │ ...                   │
│ 1 └───────────────────────┘ 1         │                       │
│   a  b  c  d  e  f  g  h              │                       │
├───────────────────────────────────────┴───────────────────────┤
│ Move/FEN: [__________] [Move] [Undo] [Aid Engine Move]        │
│ [Create Board] [W] [B] [Play Black] [Dump FEN]                │
│ [x] Always show current view                                  │
│ To Move: White       Game: White in Check!                    │
└───────────────────────────────────────────────────────────────┘
```

The board is an accessible CSS grid of buttons rather than a canvas. It uses the original piece images and square colours from `shared/`, a LightSeaGreen outline on the last move's target, and an Azure outline on the selected square and on the engine's origin square. The move list stays monospace, like the original's Courier New.

### 10.2 Controls

| Control | Behaviour | Fixes |
|---|---|---|
| Move | Plays the box's text, clears the box and refocuses it. Enter does the same (D4). Empty box does nothing. On success, the engine replies | U1 |
| Undo | Calls undo, then renders | |
| Aid Engine Move | Engine plays the human's side and then, if the game continues, replies | U11 |
| Create Board | Empty box does nothing. Otherwise asks `Current board will be lost! Continue?`, then creates a new game from the FEN. If it's invalid, shows `Error while creating board from FEN: …` and keeps the current game | U3 |
| Dump FEN | Puts the current FEN into the box | R10 |
| Play Black | Asks `This will reset the current game`, then starts a new game as Black, shows the board from Black's side, and the engine moves first | U2 |
| W and B | See 10.3 | U8 |
| Board click | See 10.4 | U4-U7 |

The status labels use the original wording wherever a state existed:

| State | Game label |
|---|---|
| Check | `White in Check!` |
| Checkmate | `Check Mate [White] wins!!` |
| Stalemate | `Stale Mate` |
| Draw by material | `Draw (insufficient material)` |
| Draw by command | `Draw` |
| Resignation | `White resigned, Black wins` |

Move errors keep the original format: `Move error: White cannot make move: Nf9, reason: InvalidFormat`. They appear once, in a modal dialog (U5).

### 10.3 Board orientation

The original's rules are kept, except that W and B now always work and clicks follow what's displayed.

- **Checked (default):** the orientation is locked. It starts on White, or Black after Play Black.
- **Unchecked:** the board follows the side to move, unless W or B was pressed since the last move.
- **Checking the box:** locks whatever is currently displayed.
- **W or B:** shows that side at once. If locked, this also becomes the locked orientation (U8).

This is a pure function, tested separately from React.

### 10.4 Board clicks

| Click | Result |
|---|---|
| Not the human's turn, or a request is running | Nothing |
| Own piece | Selects it, replacing any selection |
| Elsewhere, with a selection | Attempts the move |
| Elsewhere, no selection | Nothing |

On success the selection clears. On failure the error shows and the selection stays, so another target can be tried. A pawn reaching the last rank opens a picker for Q, R, B or N first (U6). Undo clears the selection and highlights.

### 10.5 Asynchronous behaviour

While a request is running, Move, Undo, Aid Engine Move, Create Board, Play Black and board clicks are disabled, and a "Cach is thinking…" indicator appears during engine moves. W, B and the checkbox stay active, so the board can be flipped during a search. Controls are restored on every outcome, including errors (U10).

| Startup or failure case | UI behaviour |
|---|---|
| Server starting or book loading | Shows `Please wait, loading Opening Book ...` and polls `/api/health` |
| `GameNotFound` (server restarted or game evicted) | Explains that the game is gone and offers a new one |
| Network failure | Shows the error, and the game remains usable once the server is back |

### 10.6 State

There is no client-side rules code. `GameView` is the server's answer and is always rendered as given. Local state is only the selection, view orientation, input text, busy flag and dialogs, held in a single reducer. No Redux or other state library is needed.

### 10.7 Reload protection (D6)

A reload during a game shouldn't lose it by accident, and the confirmation has to be an application popup. Browsers limit this: a page can only show its own UI for reloads it can intercept. The only way to stop the toolbar reload button beforehand is `beforeunload`, which shows the browser's own dialog, so it isn't used. There are two mechanisms instead:

| Reload by | What happens |
|---|---|
| Keyboard: F5, Ctrl+R, Ctrl+Shift+R, Ctrl+F5, Shift+F5, Cmd+R | Intercepted, so nothing reloads yet. The popup `Reloading will lose the current game. Continue?` offers **Reload** or **Keep playing** |
| Toolbar button, or anything else that can't be intercepted | The page does reload, but the game is safe on the server and its ID is in `sessionStorage`. The page then shows `The page was reloaded during a game…`, offering **Keep playing** or **Start new game** |

The game is only lost once the player confirms. Pressing Escape keeps it.

"In progress" means the game hasn't ended, and either a move has been played or it started from a custom FEN. Otherwise nothing is lost, so nothing is asked and the reload simply starts a new game.

After **Keep playing**, the game continues with the board shown from the human's side. If the engine's reply was never requested, or a search was still running when the page reloaded, the UI requests it or waits for it, retrying on `GameBusy`.

**Not covered:** closing the tab gives no warning, because that also needs `beforeunload`. The game stays on the server until evicted, but `sessionStorage` goes with the tab, so it can't be reached again.

## 11. PNG endpoint

`GET /api/games/:id/board.png` ports `RenderAsImage`: an image of `8 × tile + 2 × border` pixels, LightGray background, the same square colours, coordinates and pieces, with the last move's target outlined. Colours and layout constants are shared with the web board through `shared/`. It works during a search because it reads the game's current position, which a search doesn't touch.

## 12. Logging and configuration

Logging replaces the original's log4net setup, which wrote a 200 MB rolling file at DEBUG, including every search node.

- **`info` (default):** game created, moves played, engine choice with source, value, candidates, nodes and time, and the FEN after each engine move, as the original logged.
- **`debug`:** adds request detail.
- **Search nodes:** not logged at any level. Per-node logging would dominate the search time.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | API port |
| `LOG_LEVEL` | `info` | pino level |
| `CACH_BOOK_PATH` | `data/cach_openingbook.txt` | Book location |
| `CACH_SEARCH_WORKERS` | `2` | Search pool size |
| `CACH_SEARCH_DEPTH` | `4` | Testing only. The UI has no depth control, as in the original |

### Development restarts

`npm run dev` runs the API through `api/dev/server.ts` instead of `node --watch`. On Windows, reading a file whose last-access time is over an hour old raises a file change event, and `--watch` restarts on the event alone. So the first start after an idle hour restarted the API up to twice in its first seconds, losing any game created in that time.

The runner treats an event only as a prompt to compare the modified time and size of each `.ts` file in `api/src` and `shared/src`, and restarts only if one was added, removed or modified. Any restart still loses the in-memory games. Unlike `--watch`, it doesn't watch `node_modules`, so restart it by hand after installing packages. `npm start` doesn't use it.

## 13. Testing

An exact match against the C# app is no longer the goal, because the bugs are being fixed. Correctness is established against independent sources instead.

| Layer | Method | What it proves |
|---|---|---|
| Move generation | **Perft** against published node counts: start position to depth 5 (4,865,609), Kiwipete to 4 (4,085,603), and standard positions 3, 4 and 5 | Rules are correct, including castling, en passant and promotion |
| Rules | **Differential testing against `chess.js`** over 1,000 seeded random games: legal moves, FEN, SAN, check, mate, stalemate, insufficient material and threefold repetition at every ply | Agreement on ordinary play at scale |
| Bug ledger | One regression test per ledger ID, using the positions in section 4 where one exists | Each bug stays fixed |
| Original tests | Port the 90 in-scope cases of the original 101 NUnit cases (see below). Positions the corrected rules reject are adjusted, each marked with its ledger ID | Intended behaviour is retained |
| Evaluation | Fixture of evaluation values produced by the C# `BoardEvaluator` on normal positions, committed as JSON | Tables and weights were copied correctly |
| Search | **Alpha-beta result compared with plain minimax** at low depth on fixture positions: same value, same tie set | Pruning changes nothing but speed, which also covers E4 |
| Search | The same search twice gives the same candidates | E3 |
| Search | Mate-in-one and mate-in-two positions, and avoidance of stalemate when winning | D2, E6 |
| Book | Loader counts match the file, every move is legal, and lookup behaves at the 20-ply limit | Book integrity, E12 |
| API | supertest on every route and every error code, with a shallow search depth | Contract |
| UI | React Testing Library on controls, messages and orientation | Section 10 |
| End to end | Playwright against the real server: move by typing and clicking, promotion, Play Black, Create Board, Undo, Aid, Dump FEN | The whole app works in a browser |

**Original test accounting.** The C# suites contain 101 test cases. Of these, 90 are in scope. The other 11 aren't ported:

| Tests | Cases | Why |
|---|---|---|
| `OpeningBookBuilderTests` | 7 | Cover the out-of-scope builder and hard-coded local paths. The real book has its own tests instead |
| `PGNMultiGameParserTests` | 2 | Out of scope |
| `BoardSaveLoadTests` | 1 | `WriteToFile` is out of scope |
| `TestClass` | 1 | Empty placeholder |

Two `InCheckHelperTests` cases used adjacent kings. That position is now rejected, so one test asserts the rejection instead.

**Full-game check.** Engine-versus-engine games through the live server are checked move by move against `chess.js`. An early run, before repetition draws were added, had one of six games stuck repeating until a 200-ply limit, which is why the rule was added.

## 14. Risks

| Risk | Mitigation |
|---|---|
| The engine plays differently from the C# app. This is expected from the fixes, but it means the strength change isn't measured | The search tests prove correctness, not strength. If it matters, a C# versus TS match can be added later |
| Without a 50-move rule, a long game can wander without progress | Threefold repetition guarantees every game ends eventually, though possibly after many moves. A human can end a game with `(=)` |
| A browser may handle a reload shortcut before the page sees it | Tests confirm the page's handling, but headless browsers have no browser-level shortcuts. If one gets through, it behaves like a toolbar reload, and the game is still protected (section 10.7) |
| Node's TypeScript type stripping requires erasable syntax only | `erasableSyntaxOnly` in `tsconfig`, so `tsc` flags anything unsupported |
| `@napi-rs/canvas` could fail to install on a platform | Windows prebuilt binaries exist. The renderer is only used by the PNG route |

## 15. Delivery plan

1. **Foundation:** workspace, `shared/`, core rules, FEN, notation, game. Exit: perft and `chess.js` tests pass.
2. **Engine:** evaluator, search, filter, book, workers. Exit: search and book tests pass, and benchmark numbers are recorded.
3. **API:** routes, store, PNG. Exit: API tests pass.
4. **Web:** components, reducer, API client. Exit: UI tests pass.
5. **Finish:** ported NUnit tests, ledger coverage check, Playwright tests, README.

## 16. Definition of done

- Every section 4 ledger ID has a passing regression test.
- Perft counts match, and `chess.js` differential testing reports no disagreements.
- The 90 in-scope original test cases are ported, with any changes tied to a ledger ID.
- A full game can be played in the browser by typing and by clicking, as White and as Black.
- Every control in section 10.2 works in the browser.
- `npm test` passes from a clean install, and `npm run dev` starts both apps.
