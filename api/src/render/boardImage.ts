// Board PNG, ported from cachRendering/BoardRenderer.RenderAsImage. Design section 11.
import { join } from 'node:path';
import { BOARD_COLORS, OUTLINE_WIDTH, type Color, type GameView, type PieceCode } from '@cachts/shared';
import { config } from '../config.ts';

export interface ImageOptions {
  view: Color;
  tile: number;
  border: number;
}

export async function renderBoardPng(game: GameView, { view, tile, border }: ImageOptions): Promise<Buffer> {
  // Imported on first use, so a platform without the native module only loses this route.
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const size = 8 * tile + 2 * border;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = BOARD_COLORS.imageBackground;
  ctx.fillRect(0, 0, size, size);

  const white = view === 'white';
  const screenOf = (rank: number, file: number): [number, number] => [
    (white ? file : 7 - file) * tile + border,
    (white ? 7 - rank : rank) * tile + border,
  ];

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? BOARD_COLORS.light : BOARD_COLORS.dark;
      ctx.fillRect(col * tile + border, row * tile + border, tile, tile);
    }
  }

  ctx.fillStyle = '#000000';
  ctx.font = '11px sans-serif';
  ctx.textBaseline = 'top';
  const xOff = Math.floor(tile / 2) - 4;
  const yOff = Math.floor(tile / 2) - 6;
  for (let i = 0; i < 8; i++) {
    const fileLabel = String.fromCharCode(97 + (white ? i : 7 - i));
    ctx.fillText(fileLabel, i * tile + xOff + border, 8 * tile + 2 + border);
    ctx.fillText(fileLabel, i * tile + xOff + border, border - 16);
    const rankLabel = String(white ? 8 - i : i + 1);
    ctx.fillText(rankLabel, 8 * tile + 2 + border, i * tile + yOff + border);
    ctx.fillText(rankLabel, border - 12, i * tile + yOff + border);
  }

  if (game.lastMove) {
    const to = game.lastMove.to;
    const [x, y] = screenOf(to.charCodeAt(1) - 49, to.charCodeAt(0) - 97);
    ctx.strokeStyle = BOARD_COLORS.lastMove;
    ctx.lineWidth = OUTLINE_WIDTH;
    ctx.strokeRect(x, y, tile, tile);
  }

  const images = new Map<PieceCode, Awaited<ReturnType<typeof loadImage>>>();
  for (let sq = 0; sq < 64; sq++) {
    const code = game.board[sq];
    if (!code) continue;
    if (!images.has(code)) images.set(code, await loadImage(join(config.piecesDir, `${code}.png`)));
    const [x, y] = screenOf(sq >> 3, sq & 7);
    ctx.drawImage(images.get(code)!, x, y, tile, tile);
  }
  return canvas.toBuffer('image/png');
}
