// Express routes. Design section 6.
import { existsSync } from 'node:fs';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { Logger } from 'pino';
import { z } from 'zod';
import {
  DEFAULT_IMAGE_BORDER, DEFAULT_IMAGE_TILE, type ApiErrorBody, type Color, type EngineMoveResponse, type GameView,
  type HealthResponse,
} from '@cachts/shared';
import { config } from '../config.ts';
import { FenError } from '../core/fen.ts';
import { Game, toSide } from '../core/game.ts';
import { BISHOP, KNIGHT, QUEEN, ROOK, WHITE, sqFromName } from '../core/position.ts';
import type { EngineService } from '../engine/engineService.ts';
import { renderBoardPng } from '../render/boardImage.ts';
import type { GameRecord, GameStore } from '../store/gameStore.ts';
import { ApiError } from './errors.ts';

const color = z.enum(['white', 'black']);
const square = z.string().regex(/^[a-h][1-8]$/);
const createGameBody = z.object({ fen: z.string().max(200).optional(), humanColor: color.optional() }).strict()
  .refine((b) => !(b.fen !== undefined && b.humanColor !== undefined), 'fen and humanColor cannot be combined');
const moveBody = z.union([
  z.object({ move: z.string().min(1).max(40) }).strict(),
  z.object({ from: square, to: square, promotion: z.enum(['Q', 'R', 'B', 'N']).optional() }).strict(),
]);
const imageQuery = z.object({
  view: color.default('white'),
  tile: z.coerce.number().int().min(20).max(120).default(DEFAULT_IMAGE_TILE),
  border: z.coerce.number().int().min(0).max(40).default(DEFAULT_IMAGE_BORDER),
});
const PROMOTION = { Q: QUEEN, R: ROOK, B: BISHOP, N: KNIGHT } as const;

function parseOrThrow<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ApiError(400, 'BadRequest', `${issue.path.join('.') || 'request'}: ${issue.message}`);
  }
  return result.data;
}

const sideName = (side: number): Color => (side === WHITE ? 'white' : 'black');

export function toGameView(record: GameRecord): GameView {
  const { game, id } = record;
  return {
    id,
    fen: game.fen(),
    board: game.boardCodes(),
    toMove: sideName(game.pos.side),
    humanColor: sideName(game.humanSide),
    engineColor: sideName(game.engineSide),
    status: game.status,
    pgn: game.pgnList(),
    lastMove: game.lastMove,
    captured: game.captured(),
  };
}

export interface AppDeps {
  store: GameStore;
  engine: () => EngineService | null;
  bookNodes: () => number;
  logger: Logger;
}

export function createApp({ store, engine, bookNodes, logger }: AppDeps): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  const requireGame = (req: Request): GameRecord => {
    const record = store.get(String(req.params.id));
    if (!record) throw new ApiError(404, 'GameNotFound', 'This game no longer exists.');
    return record;
  };
  const requireIdle = (record: GameRecord): void => {
    if (record.busy) throw new ApiError(409, 'GameBusy', 'A search is running for this game.');
  };

  app.get('/api/health', (_req, res) => {
    const body: HealthResponse = { status: engine() ? 'ready' : 'loading', bookNodes: bookNodes() };
    res.json(body);
  });

  app.post('/api/games', (req, res) => {
    if (!engine()) throw new ApiError(503, 'BookLoading', 'The opening book is still loading.');
    const body = parseOrThrow(createGameBody, req.body ?? {});
    let game: Game;
    try {
      game = body.fen !== undefined
        ? new Game(body.fen)
        : new Game(undefined, toSide(body.humanColor ?? 'white'));
    } catch (e) {
      if (e instanceof FenError) throw new ApiError(400, 'InvalidFen', e.message);
      throw e;
    }
    const record = store.add(game);
    logger.info({ game: record.id, fen: game.fen() }, 'game created');
    res.status(201).json(toGameView(record));
  });

  app.get('/api/games/:id', (req, res) => {
    res.json(toGameView(requireGame(req)));
  });

  app.delete('/api/games/:id', (req, res) => {
    requireGame(req);
    store.delete(String(req.params.id));
    res.status(204).end();
  });

  app.post('/api/games/:id/moves', (req, res) => {
    const record = requireGame(req);
    requireIdle(record);
    const body = parseOrThrow(moveBody, req.body);
    const { game } = record;
    if (game.isOver) throw new ApiError(422, 'GameOver', 'The game is over.');
    if (game.pos.side !== game.humanSide) throw new ApiError(409, 'NotYourTurn', 'It is not your turn.');
    const result = 'move' in body
      ? game.moveText(body.move)
      : game.moveClick(sqFromName(body.from), sqFromName(body.to), body.promotion ? PROMOTION[body.promotion] : 0);
    if (!result.ok) throw new ApiError(422, result.error, `Move rejected: ${result.error}`);
    logger.info({ game: record.id, san: game.lastMove?.san }, 'human move');
    res.json(toGameView(record));
  });

  const engineMoveHandler = (forEngine: boolean) => async (req: Request, res: Response): Promise<void> => {
    const record = requireGame(req);
    requireIdle(record);
    const service = engine();
    if (!service) throw new ApiError(503, 'BookLoading', 'The opening book is still loading.');
    const { game } = record;
    if (game.isOver) throw new ApiError(422, 'GameOver', 'The game is over.');
    const expected = forEngine ? game.engineSide : game.humanSide;
    if (game.pos.side !== expected) throw new ApiError(409, 'NotYourTurn', "It is not that side's turn.");

    record.busy = true;
    try {
      const engineMove = await service.playMove(game, forEngine);
      logger.info({ game: record.id, ...engineMove, fen: game.fen(), aid: !forEngine }, 'engine move');
      const body: EngineMoveResponse = { game: toGameView(record), engineMove };
      res.json(body);
    } finally {
      record.busy = false;
    }
  };
  app.post('/api/games/:id/engine-move', engineMoveHandler(true));
  app.post('/api/games/:id/aid-move', engineMoveHandler(false));

  app.post('/api/games/:id/undo', (req, res) => {
    const record = requireGame(req);
    requireIdle(record);
    record.game.undoTurn();
    res.json(toGameView(record));
  });

  app.get('/api/games/:id/board.png', async (req, res) => {
    const record = requireGame(req);
    const options = parseOrThrow(imageQuery, req.query);
    res.type('png').send(await renderBoardPng(toGameView(record), options));
  });

  app.use('/api', () => {
    throw new ApiError(404, 'BadRequest', 'Unknown API route.');
  });

  const { webDist } = config;
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.use((req, res, next) => {
      if (req.method === 'GET') res.sendFile('index.html', { root: webDist });
      else next();
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    let status = 500;
    let body: ApiErrorBody = { error: { code: 'InternalError', message: 'Unexpected server error.' } };
    if (err instanceof ApiError) {
      status = err.status;
      body = { error: { code: err.code, message: err.message } };
    } else if (typeof err === 'object' && err !== null && 'status' in err
      && typeof err.status === 'number' && err.status >= 400 && err.status < 500) {
      status = 400; // Malformed JSON or an oversized body, from express.json.
      body = { error: { code: 'BadRequest', message: 'Malformed request body.' } };
    } else {
      logger.error({ err }, 'unhandled error');
    }
    res.status(status).json(body);
  });

  return app;
}
