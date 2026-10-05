import { useEffect, useRef } from 'react';
import changelogSource from '../../CHANGELOG.md?raw';
import { parseChangelog } from '../core/changelog';
import './ChangelogDialog.css';

const entries = parseChangelog(changelogSource);

/** Backtick spans become <code>; everything else stays plain text. */
function renderText(text: string) {
  return text.split('`').map((part, index) => (index % 2 ? <code key={index}>{part}</code> : part));
}

export default function ChangelogDialog({ currentVersion, onClose }: { currentVersion: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return (
    <div className="changelog-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="changelog-dialog" role="dialog" aria-modal="true" aria-labelledby="changelog-title">
        <header className="changelog-header">
          <div><div className="eyebrow">DCSS SUITE</div><h2 id="changelog-title">Historial de cambios</h2></div>
          <button ref={closeRef} className="changelog-close" type="button" onClick={onClose} aria-label="Cerrar historial">×</button>
        </header>
        <ol className="changelog-list">
          {entries.map((entry) => (
            <li key={entry.version} className={entry.version === currentVersion ? 'current' : undefined}>
              <div className="changelog-meta"><strong>v{entry.version}</strong>{entry.version === currentVersion && <span className="changelog-current">Instalada</span>}<time dateTime={entry.date}>{entry.date}</time></div>
              <p>{renderText(entry.text)}</p>
            </li>
          ))}
          {!entries.length && <li><p>Sin historial disponible.</p></li>}
        </ol>
      </section>
    </div>
  );
}
