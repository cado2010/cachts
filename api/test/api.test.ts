// Every route and error code. Search runs inline at depth 1 and the book is a tiny fixture.
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { GameView } from '@cachts/shared';
import { OpeningBook } from '../src/book/openingBook.ts';
import { parseFen, START_FEN } from '../src/core/fen.ts';
import { EngineService } from '../src/engine/engineService.ts';
import { searchRoot } from '../src/engine/search.ts';
import type { Searcher } from '../src/engine/searchPool.ts';
import { createApp } from '../src/http/app.ts';
import { GameStore } from '../src/store/gameStore.ts';
import { Game } from '../src/core/game.ts';

function setup(searcher?: Searcher, ready = true) {
  const inline: Searcher = {
    search: async (fen, depth) => searchRoot(parseFen(fen), depth),
    close: async () => {},
  };
  const store = new GameStore();
  const engine = ready ? new EngineService(OpeningBook.empty(), searcher ?? inline, 1) : null;
  const app = createApp({ store, engine: () => engine, bookNodes: () => 7, logger: pino({ level: 'silent' }) });
  return { app, store };
}
const create = async (app: ReturnType<typeof setup>['app'], body: object = {}): Promise<GameView> =>
  (await request(app).post('/api/games').send(body).expect(201)).body;
const code = (res: request.Response): string => res.body.error.code;

describe('health', () => {
  it('reports ready and loading', async () => {
    expect((await request(setup().app).get('/api/health')).body).toEqual({ status: 'ready', bookNodes: 7 });
    expect((await request(setup(undefined, false).app).get('/api/health')).body.status).toBe('loading');
  });
});

describe('POST /api/games', () => {
  it('creates a standard game', async () => {
    const view = await create(setup().app);
    expect(view).toMatchObject({
      fen: START_FEN, toMove: 'white', humanColor: 'white', engineColor: 'black', status: { state: 'active' },
      pgn: [], lastMove: null,
    });
    expect(view.board).toHaveLength(64);
    expect(view.board[0]).toBe('wR');
    expect(view.board[63]).toBe('bR');
    expect(view.board[52]).toBe('bp');
  });
  it('honours humanColor', async () => {
    expect(await create(setup().app, { humanColor: 'black' })).toMatchObject({ humanColor: 'black', engineColor: 'white' });
  });
  it('D1 the human plays the FEN side to move', async () => {
    const view = await create(setup().app, { fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3' });
    expect(view).toMatchObject({ toMove: 'black', humanColor: 'black', engineColor: 'white' });
  });
  it('rejects a bad FEN', async () => {
    const res = await request(setup().app).post('/api/games').send({ fen: 'nonsense' });
    expect(res.status).toBe(400);
    expect(code(res)).toBe('InvalidFen');
  });
  it('rejects fen with humanColor, unknown fields and bad JSON', async () => {
    const { app } = setup();
    for (const body of [{ fen: START_FEN, humanColor: 'black' }, { nope: 1 }, { humanColor: 'red' }]) {
      const res = await request(app).post('/api/games').send(body);
      expect(res.status).toBe(400);
      expect(code(res)).toBe('BadRequest');
    }
    const res = await request(app).post('/api/games').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(code(res)).toBe('BadRequest');
  });
  it('returns BookLoading before the book is ready', async () => {
    const res = await request(setup(undefined, false).app).post('/api/games').send({});
    expect(res.status).toBe(503);
    expect(code(res)).toBe('BookLoading');
  });
});

describe('moves', () => {
  it('plays typed and click moves', async () => {
    const { app } = setup();
    const g = await create(app, { fen: 'r3k2r/8/8/8/8/8/P7/R3K2R w KQkq -' });
    const typed = await request(app).post(`/api/games/${g.id}/moves`).send({ move: 'a4' }).expect(200);
    expect(typed.body.lastMove).toEqual({ from: 'a2', to: 'a4', san: 'a4', color: 'white' });
    expect(typed.body.toMove).toBe('black');
  });
  it('plays a click castle and a click promotion', async () => {
    const { app } = setup();
    const c = await create(app, { fen: 'r3k2r/8/8/8/8/8/P7/R3K2R w KQkq -' });
    const castle = await request(app).post(`/api/games/${c.id}/moves`).send({ from: 'e1', to: 'g1' }).expect(200);
    expect(castle.body.lastMove).toEqual({ from: 'e1', to: 'g1', san: 'O-O', color: 'white' }); // U12
    const p = await create(app, { fen: '8/P6k/8/8/8/8/8/K7 w - -' });
    const missing = await request(app).post(`/api/games/${p.id}/moves`).send({ from: 'a7', to: 'a8' });
    expect(code(missing)).toBe('InvalidFormat');
    const promo = await request(app).post(`/api/games/${p.id}/moves`).send({ from: 'a7', to: 'a8', promotion: 'N' }).expect(200);
    expect(promo.body.board[56]).toBe('wN');
  });
  it.each([
    ['Nf9', 'InvalidFormat'],
    ['Qa4', 'NoPieceInRange'],
    ['Kb1b2', 'NoSuchPiece'],
    ['o-o', 'InvalidCastle'],
  ])('rejects %s with %s', async (move, expected) => {
    const { app } = setup();
    const g = await create(app);
    const res = await request(app).post(`/api/games/${g.id}/moves`).send({ move });
    expect(res.status).toBe(422);
    expect(code(res)).toBe(expected);
  });
  it('reports ambiguity, check and invalid kills', async () => {
    const { app } = setup();
    const a = await create(app, { fen: '4k3/8/8/8/8/3N4/8/3N2K1 w - -' });
    expect(code(await request(app).post(`/api/games/${a.id}/moves`).send({ move: 'Nf2' }))).toBe('MoreThanOnePieceInRange');
    const b = await create(app, { fen: '3k4/8/8/8/4PP2/3pQ3/4K3/8 w - -' });
    expect(code(await request(app).post(`/api/games/${b.id}/moves`).send({ move: 'Qc5' }))).toBe('KingInCheck');
    const c = await create(app);
    expect(code(await request(app).post(`/api/games/${c.id}/moves`).send({ move: 'Nxc3' }))).toBe('InvalidKill');
  });
  it('rejects moves out of turn and after game over', async () => {
    const { app } = setup();
    const g = await create(app);
    await request(app).post(`/api/games/${g.id}/moves`).send({ move: 'e4' }).expect(200);
    const turn = await request(app).post(`/api/games/${g.id}/moves`).send({ move: 'e5' });
    expect(turn.status).toBe(409);
    expect(code(turn)).toBe('NotYourTurn');

    const r = await create(app);
    const resign = await request(app).post(`/api/games/${r.id}/moves`).send({ move: '($)' }).expect(200);
    expect(resign.body.status).toEqual({ state: 'resigned', winner: 'black' });
    const after = await request(app).post(`/api/games/${r.id}/moves`).send({ move: 'e4' });
    expect(after.status).toBe(422);
    expect(code(after)).toBe('GameOver'); // U14
  });
  it('rejects a malformed move body and an unknown game', async () => {
    const { app } = setup();
    const g = await create(app);
    expect(code(await request(app).post(`/api/games/${g.id}/moves`).send({ from: 'z9', to: 'a1' }))).toBe('BadRequest');
    const missing = await request(app).post('/api/games/nope/moves').send({ move: 'e4' });
    expect(missing.status).toBe(404);
    expect(code(missing)).toBe('GameNotFound');
  });
});

describe('engine moves', () => {
  it('replies, reports its choice and refuses out of turn', async () => {
    const { app } = setup();
    const g = await create(app);
    const early = await request(app).post(`/api/games/${g.id}/engine-move`);
    expect(code(early)).toBe('NotYourTurn');
    await request(app).post(`/api/games/${g.id}/moves`).send({ move: 'e4' }).expect(200);
    const res = await request(app).post(`/api/games/${g.id}/engine-move`).expect(200);
    expect(res.body.game.toMove).toBe('white');
    expect(res.body.engineMove).toMatchObject({ source: 'search' });
    expect(res.body.engineMove.candidates).toBeGreaterThan(0);
  });
  it('aid-move plays the human side', async () => {
    const { app } = setup();
    const g = await create(app);
    const res = await request(app).post(`/api/games/${g.id}/aid-move`).expect(200);
    expect(res.body.game.lastMove.color).toBe('white');
    expect(code(await request(app).post(`/api/games/${g.id}/aid-move`))).toBe('NotYourTurn');
  });
  it('refuses after game over', async () => {
    const { app } = setup();
    const g = await create(app, { fen: '7k/8/8/8/8/8/8/K7 w - -' });
    expect(g.status).toEqual({ state: 'draw', reason: 'insufficient-material' });
    expect(code(await request(app).post(`/api/games/${g.id}/aid-move`))).toBe('GameOver');
  });
  it('GameBusy blocks changes during a search, and the flag is released afterwards', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const slow: Searcher = {
      search: async (fen, depth) => {
        await gate;
        return searchRoot(parseFen(fen), depth);
      },
      close: async () => {},
    };
    const { app } = setup(slow);
    const g = await create(app);
    const pending = request(app).post(`/api/games/${g.id}/aid-move`).then((r) => r);
    await new Promise((r) => setTimeout(r, 50));
    const moved = await request(app).post(`/api/games/${g.id}/moves`).send({ move: 'e4' });
    expect(moved.status).toBe(409);
    expect(code(moved)).toBe('GameBusy');
    expect(code(await request(app).post(`/api/games/${g.id}/undo`))).toBe('GameBusy');
    await request(app).get(`/api/games/${g.id}`).expect(200); // Reads still work.
    release();
    expect((await pending).status).toBe(200);
    await request(app).post(`/api/games/${g.id}/undo`).expect(200);
  });
  it('releases the flag when a search fails', async () => {
    const failing: Searcher = { search: async () => { throw new Error('boom'); }, close: async () => {} };
    const { app } = setup(failing);
    const g = await create(app);
    const res = await request(app).post(`/api/games/${g.id}/aid-move`);
    expect(res.status).toBe(500);
    expect(code(res)).toBe('InternalError');
    await request(app).post(`/api/games/${g.id}/moves`).send({ move: 'e4' }).expect(200);
  });
});

describe('other routes', () => {
  it('undo', async () => {
    const { app } = setup();
    const g = await create(app);
    await request(app).post(`/api/games/${g.id}/moves`).send({ move: 'e4' }).expect(200);
    const res = await request(app).post(`/api/games/${g.id}/undo`).expect(200);
    expect(res.body.fen).toBe(START_FEN);
    await request(app).post(`/api/games/${g.id}/undo`).expect(200); // At the start: not an error.
  });
  it('get and delete', async () => {
    const { app } = setup();
    const g = await create(app);
    expect((await request(app).get(`/api/games/${g.id}`).expect(200)).body.id).toBe(g.id);
    await request(app).delete(`/api/games/${g.id}`).expect(204);
    await request(app).get(`/api/games/${g.id}`).expect(404);
  });
  it('unknown API route', async () => {
    await request(setup().app).get('/api/nope').expect(404);
  });
  it('renders a PNG of the requested size', async () => {
    const { app } = setup();
    const g = await create(app);
    const res = await request(app).get(`/api/games/${g.id}/board.png`).buffer(true)
      .parse((r, done) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => done(null, Buffer.concat(chunks)));
      }).expect(200);
    expect(res.headers['content-type']).toContain('image/png');
    const png = res.body as Buffer;
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(8 * 30 + 2 * 16); // IHDR width: defaults tile 30, border 16.
    const black = await request(app).get(`/api/games/${g.id}/board.png?view=black&tile=40&border=0`).expect(200);
    expect(black.headers['content-type']).toContain('image/png');
    await request(app).get(`/api/games/${g.id}/board.png?tile=5`).expect(400);
  });
});

describe('GameStore', () => {
  it('evicts the least recently used game when full', () => {
    const store = new GameStore(2);
    const a = store.add(new Game());
    const b = store.add(new Game());
    store.get(a.id);
    const c = store.add(new Game());
    expect(store.get(a.id)).toBeDefined();
    expect(store.get(b.id)).toBeUndefined();
    expect(store.get(c.id)).toBeDefined();
  });
  it('evicts idle games, but not busy ones', () => {
    const store = new GameStore(10, 1000);
    const idle = store.add(new Game());
    const busy = store.add(new Game());
    busy.busy = true;
    store.evictIdle(Date.now() + 5000);
    expect(store.size).toBe(1);
    expect(store.get(busy.id)).toBeDefined();
    expect(store.get(idle.id)).toBeUndefined();
  });
});
