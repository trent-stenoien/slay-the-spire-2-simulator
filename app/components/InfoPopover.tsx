import { useEffect, useId, useRef, useState } from 'react';

export const KDE_WIKI_URL = 'https://en.wikipedia.org/wiki/Kernel_density_estimation';

/**
 * Info icon button for the smoothing slider. Click toggles a small popover explaining the slider
 * and linking to the KDE article (new tab). Closes on Esc (focus returns to the button) and on a
 * click outside. `defaultOpen` exists for static-render tests.
 */
export function InfoPopover({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const cardId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  return (
    <span className="info-pop" ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        className="icon-btn"
        aria-label="About smoothing"
        aria-expanded={open}
        aria-controls={cardId}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="8" cy="4.9" r="0.9" fill="currentColor" />
          <path d="M8 7.2v4.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div id={cardId} className="info-pop-card" role="dialog" aria-label="About smoothing">
          <p>Moving the slider left shows more detail (and more noise); moving it right smooths the curve more.</p>
          <a href={KDE_WIKI_URL} target="_blank" rel="noopener noreferrer">
            Kernel density estimation (Wikipedia)
          </a>
        </div>
      )}
    </span>
  );
}
