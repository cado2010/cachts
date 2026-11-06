// Modal dialogs replacing MessageBox, plus the promotion picker (ledger U6).
import { useEffect, useRef } from 'react';
import type { Color, PieceCode, PromotionLetter } from '@cachts/shared';

export type DialogRequest =
  | { kind: 'message'; title: string; text: string; resolve: () => void }
  | {
    kind: 'confirm';
    title: string;
    text: string;
    okLabel?: string;
    cancelLabel?: string;
    resolve: (ok: boolean) => void;
  }
  | { kind: 'promotion'; color: Color; resolve: (piece: PromotionLetter | null) => void };

const images = import.meta.glob<string>('../../../shared/assets/pieces/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});
const PROMOTIONS: [PromotionLetter, string][] = [['Q', 'Queen'], ['R', 'Rook'], ['B', 'Bishop'], ['N', 'Knight']];

export function Dialog({ request }: { request: DialogRequest }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    // jsdom has no showModal; the fallback keeps component tests working.
    if (el && !el.open) {
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
    }
  }, []);

  const cancel = (): void => {
    if (request.kind === 'message') request.resolve();
    else if (request.kind === 'confirm') request.resolve(false);
    else request.resolve(null);
  };

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        cancel();
      }}
    >
      {request.kind === 'promotion' ? (
        <>
          <h2 id="dialog-title">Promote pawn to</h2>
          <div className="promotion-choices">
            {PROMOTIONS.map(([letter, name]) => {
              const code = `${request.color === 'white' ? 'w' : 'b'}${letter}` as PieceCode;
              return (
                <button key={letter} type="button" aria-label={name} onClick={() => request.resolve(letter)}>
                  <img src={images[`../../../shared/assets/pieces/${code}.png`]} alt="" />
                </button>
              );
            })}
          </div>
          <div className="dialog-actions">
            <button type="button" onClick={cancel}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <h2 id="dialog-title">{request.title}</h2>
          <p>{request.text}</p>
          <div className="dialog-actions">
            {request.kind === 'confirm' && (
              <button type="button" onClick={cancel}>{request.cancelLabel ?? 'Cancel'}</button>
            )}
            <button
              type="button"
              className="primary"
              autoFocus
              onClick={() => (request.kind === 'confirm' ? request.resolve(true) : request.resolve())}
            >
              {(request.kind === 'confirm' && request.okLabel) || 'OK'}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
