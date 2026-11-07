// API contract and board constants shared by api/ and web/. See doc/cachts_design.md section 6.

export type Color = 'white' | 'black';
export type Square = string; // algebraic, e.g. "e4"
export type PromotionLetter = 'Q' | 'R' | 'B' | 'N';
/** Colour prefix plus the original image names: wK wQ wR wB wN wp bK ... bp */
export type PieceCode = `${'w' | 'b'}${'K' | 'Q' | 'R' | 'B' | 'N' | 'p'}`;

export type GameStatus =
  | { state: 'active' }
  | { state: 'check'; player: Color }
  | { state: 'checkmate'; winner: Color }
  | { state: 'stalemate' }
  | { state: 'draw'; reason: 'insufficient-material' | 'repetition' | 'agreement' }
  | { state: 'resigned'; winner: Color };

export interface LastMove {
  from: Square;
  to: Square;
  san: string;
  color: Color;
}

export interface GameView {
  id: string;
  fen: string;
  /** 64 entries: index 0 = a1, 7 = h1, 63 = h8. */
  board: (PieceCode | null)[];
  toMove: Color;
  humanColor: Color;
  engineColor: Color;
  status: GameStatus;
  pgn: string[];
  lastMove: LastMove | null;
  /** The opponent's pieces each side has captured in this game, highest rank first. */
  captured: Record<Color, PieceCode[]>;
}

export interface EngineMoveInfo {
  san: string;
  source: 'book' | 'search';
  value: number | null;
  candidates: number;
  nodes: number;
  elapsedMs: number;
}

export interface EngineMoveResponse {
  game: GameView;
  engineMove: EngineMoveInfo;
}

export interface HealthResponse {
  status: 'loading' | 'ready';
  bookNodes: number;
}

export type MoveErrorCode =
  | 'InvalidFormat'
  | 'NoSuchPiece'
  | 'MoreThanOnePieceInRange'
  | 'NoPieceInRange'
  | 'KingInCheck'
  | 'InvalidKill'
  | 'InvalidCastle'
  | 'GameOver';

export type ApiErrorCode =
  | MoveErrorCode
  | 'BadRequest'
  | 'InvalidFen'
  | 'GameNotFound'
  | 'GameBusy'
  | 'NotYourTurn'
  | 'BookLoading'
  | 'InternalError';

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string };
}

export const isGameOver = (s: GameStatus): boolean => s.state !== 'active' && s.state !== 'check';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Board appearance, from cachRendering/BoardRenderer.cs (.NET named colours).
export const BOARD_COLORS = {
  light: '#F4A460', // SandyBrown
  dark: '#8B4513', // SaddleBrown
  lastMove: '#20B2AA', // LightSeaGreen
  highlight: '#F0FFFF', // Azure
  imageBackground: '#D3D3D3', // LightGray
} as const;
export const OUTLINE_WIDTH = 4;
export const DEFAULT_IMAGE_TILE = 30;
export const DEFAULT_IMAGE_BORDER = 16;
