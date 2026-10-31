import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { buildFeedbackUrl, MAX_TITLE_LENGTH, type FeedbackType } from '../lib/feedback';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])';

/** Footer link plus a native <dialog> form that opens a prefilled GitHub "New issue" page. */
export function FeedbackDialog({ gameVersion }: { gameVersion: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const [type, setType] = useState<FeedbackType>('issue');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const uid = useId();

  const reset = () => {
    setType('issue');
    setTitle('');
    setDescription('');
  };

  // Native close (Esc, close button, submit) returns focus to the opener.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => openerRef.current?.focus();
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, []);

  const close = () => dialogRef.current?.close();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    const url = buildFeedbackUrl({ type, title, description }, { gameVersion, pageUrl: location.href });
    window.open(url, '_blank', 'noopener');
    close();
    reset();
  };

  // showModal() makes the rest of the page inert; this keeps Tab cycling inside the dialog.
  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== 'Tab') return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <button type="button" className="btn-link" ref={openerRef} onClick={() => dialogRef.current?.showModal()}>
        Issues or suggestions
      </button>
      <dialog
        ref={dialogRef}
        className="feedback-dialog"
        aria-labelledby={`${uid}-title`}
        onKeyDown={onKeyDown}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <form onSubmit={onSubmit} className="feedback-form">
          <div className="feedback-head">
            <h2 id={`${uid}-title`}>Issues or suggestions</h2>
            <button type="button" className="icon-btn" aria-label="Close" onClick={close}>
              ×
            </button>
          </div>
          <fieldset className="feedback-type">
            <legend>Type</legend>
            <label>
              <input type="radio" name="type" checked={type === 'issue'} onChange={() => setType('issue')} /> Issue
            </label>
            <label>
              <input type="radio" name="type" checked={type === 'suggestion'} onChange={() => setType('suggestion')} /> Suggestion
            </label>
          </fieldset>
          <label className="field" htmlFor={`${uid}-t`}>
            Title
          </label>
          <input id={`${uid}-t`} value={title} maxLength={MAX_TITLE_LENGTH} required onChange={(e) => setTitle(e.target.value)} />
          <label className="field" htmlFor={`${uid}-d`}>
            Description
          </label>
          <textarea id={`${uid}-d`} value={description} rows={6} required onChange={(e) => setDescription(e.target.value)} />
          <p className="muted small">A GitHub account is needed to submit, and reports are public.</p>
          <div className="feedback-actions">
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Continue on GitHub
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
