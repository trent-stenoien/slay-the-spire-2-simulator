import { useEffect, useState, type ReactNode } from 'react';
import { readCollapsed, writeCollapsed } from '../lib/panelState';

interface Props {
  /** Stable id: names the storage key and derives `${id}-h` (heading) and `${id}-body`. */
  id: string;
  title: string;
  /** Small info that stays visible in the title bar when collapsed (counts, etc.). */
  aside?: ReactNode;
  /** When this value changes (and on mount), the panel expands. */
  expandOn?: unknown;
  children: ReactNode;
}

/** A panel whose whole title bar toggles the body. Collapsed state is remembered per id. */
export function Panel({ id, title, aside, expandOn, children }: Props) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(id));
  const bodyId = `${id}-body`;

  const set = (v: boolean) => {
    setCollapsed(v);
    writeCollapsed(id, v);
  };

  useEffect(() => {
    if (expandOn !== undefined) {
      setCollapsed(false);
      writeCollapsed(id, false);
    }
  }, [expandOn, id]);

  return (
    <section className={`panel${collapsed ? ' collapsed' : ''}`} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="panel-title">
        <button type="button" className="panel-toggle" aria-expanded={!collapsed} aria-controls={bodyId} onClick={() => set(!collapsed)}>
          <svg className="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="m6 9 6 6 6-6" />
          </svg>
          <span className="panel-title-text">{title}</span>
          {aside !== undefined && <span className="muted panel-aside">{aside}</span>}
        </button>
      </h2>
      <div id={bodyId} className="panel-body" hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}
