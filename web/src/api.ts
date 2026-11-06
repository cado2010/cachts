// Thin client for the API in design section 6.
import type {
  ApiErrorBody, ApiErrorCode, Color, EngineMoveResponse, GameView, HealthResponse, PromotionLetter, Square,
} from '@cachts/shared';

export class ApiFailure extends Error {
  readonly code: ApiErrorCode | 'NetworkError';

  constructor(code: ApiErrorCode | 'NetworkError', message: string) {
    super(message);
    this.code = code;
  }
}

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiFailure('NetworkError', 'Could not reach the Cach server.');
  }
  if (res.status === 204) return undefined as T;
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiFailure('NetworkError', 'The Cach server is not responding correctly.');
  }
  if (!res.ok) {
    const { error } = json as ApiErrorBody;
    throw new ApiFailure(error.code, error.message);
  }
  return json as T;
}

export type MoveInput = { move: string } | { from: Square; to: Square; promotion?: PromotionLetter };

export const api = {
  health: () => call<HealthResponse>('/health'),
  createGame: (body: { fen?: string; humanColor?: Color }) => call<GameView>('/games', 'POST', body),
  getGame: (id: string) => call<GameView>(`/games/${id}`),
  deleteGame: (id: string) => call<void>(`/games/${id}`, 'DELETE'),
  move: (id: string, input: MoveInput) => call<GameView>(`/games/${id}/moves`, 'POST', input),
  engineMove: (id: string) => call<EngineMoveResponse>(`/games/${id}/engine-move`, 'POST'),
  aidMove: (id: string) => call<EngineMoveResponse>(`/games/${id}/aid-move`, 'POST'),
  undo: (id: string) => call<GameView>(`/games/${id}/undo`, 'POST'),
};
