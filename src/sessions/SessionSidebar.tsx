import { useEffect, useRef, useState, useCallback } from 'react';
import { Session } from '../db';
import { KineticText } from '../components/KineticText';
import { ScrambleTitle } from '../components/ScrambleTitle';
import { FileExplorer } from '../vault/FileExplorer';

interface Props {
  sessions: Session[];
  currentId: string | undefined;
  open: boolean;
  onSelect: (s: Session) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  vaultPath: string;
  onOpenFile: (path: string, content: string, name: string) => void;
}

function groupByDate(sessions: Session[]): Record<string, Session[]> {
  const now = Date.now();
  const DAY = 86400000;
  const groups: Record<string, Session[]> = {
    Hoje: [],
    Ontem: [],
    'Esta semana': [],
    'Mais antigas': [],
  };

  for (const s of sessions) {
    const diff = now - s.updated_at;
    if (diff < DAY) groups['Hoje'].push(s);
    else if (diff < DAY * 2) groups['Ontem'].push(s);
    else if (diff < DAY * 7) groups['Esta semana'].push(s);
    else groups['Mais antigas'].push(s);
  }

  return groups;
}

export function SessionSidebar({ sessions, currentId, open, onSelect, onNew, onDelete, vaultPath, onOpenFile }: Props) {
  const [tab, setTab] = useState<'sessions' | 'files'>('sessions');
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? sessions.filter(
        (s) =>
          s.title.toLowerCase().includes(query.toLowerCase()) ||
          s.content.toLowerCase().includes(query.toLowerCase()),
      )
    : sessions;

  const groups = groupByDate(filtered);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') setQuery('');
    },
    [],
  );

  return (
    <aside
      className="ds-sidebar"
      style={{
        width: open ? 220 : 0,
        minWidth: open ? 220 : 0,
        overflow: 'hidden',
        transition: 'width 200ms ease, min-width 200ms ease',
        borderRight: `0.5px solid var(--border)`,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary)',
        flexShrink: 0,
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: '0.5px solid var(--border)',
          flexShrink: 0,
        }}
      >
        {(['sessions', 'files'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              borderBottom: tab === t ? '1.5px solid var(--accent)' : '1.5px solid transparent',
              padding: '7px 0',
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-xs)',
              color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
              letterSpacing: '0.02em',
            }}
          >
            {t === 'sessions' ? 'Sessões' : 'Arquivos'}
          </button>
        ))}
      </div>

      {tab === 'sessions' ? (
        <div style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', flex: 1, overflow: 'hidden' }}>
          {/* New session button */}
          <button
            onClick={onNew}
            style={{
              background: 'var(--bg-overlay)',
              border: `0.5px solid var(--border)`,
              borderRadius: 6,
              padding: 'var(--space-2) var(--space-3)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
          >
            + Nova sessão
          </button>

          {/* Search input */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar..."
            style={{
              background: 'var(--bg-overlay)',
              border: `0.5px solid var(--border)`,
              borderRadius: 6,
              padding: 'var(--space-2) var(--space-3)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-sm)',
              outline: 'none',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />

          {/* Session list */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', marginTop: 'var(--space-1)' }}>
            {Object.entries(groups).map(([label, items]) => {
              if (items.length === 0) return null;
              return (
                <div key={label} style={{ marginBottom: 'var(--space-3)' }}>
                  <div
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-ui)',
                      fontWeight: 'var(--weight-medium)',
                      padding: 'var(--space-1) var(--space-2)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    <KineticText text={label} baseWeight={500} peakWeight={600} />
                  </div>
                  {items.map((s) => (
                    <SessionItem
                      key={s.id}
                      session={s}
                      active={s.id === currentId}
                      onSelect={onSelect}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', padding: 'var(--space-3) var(--space-2)', fontFamily: 'var(--font-ui)' }}>
                Nenhuma sessão
              </div>
            )}
          </div>
        </div>
      ) : (
        <FileExplorer vaultPath={vaultPath} onOpenFile={onOpenFile} />
      )}
    </aside>
  );
}

function SessionItem({
  session,
  active,
  onSelect,
  onDelete,
}: {
  session: Session;
  active: boolean;
  onSelect: (s: Session) => void;
  onDelete: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const previousTitleRef = useRef(session.title);
  const shouldScrambleTitle =
    previousTitleRef.current.startsWith('Sessão ·') &&
    !session.title.startsWith('Sessão ·') &&
    session.word_count > 0;

  useEffect(() => {
    previousTitleRef.current = session.title;
  }, [session.title]);

  return (
    <div
      onClick={() => onSelect(session)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: 'var(--space-2) var(--space-2)',
        borderRadius: 4,
        cursor: 'pointer',
        background: active
          ? 'var(--bg-surface)'
          : hovered
          ? 'var(--bg-overlay)'
          : 'transparent',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 'var(--space-1)',
      }}
    >
      <div style={{ overflow: 'hidden', flex: 1 }}>
        <div
          style={{
            fontSize: 'var(--text-sm)',
            color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontFamily: 'var(--font-ui)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <ScrambleTitle
            text={session.title}
            animate={shouldScrambleTitle}
          />
        </div>
        {session.word_count > 0 && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', marginTop: 2 }}>
            {session.word_count} palavras
          </div>
        )}
      </div>

      {hovered && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(session.id);
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: 'var(--text-xs)',
            padding: '2px 4px',
            borderRadius: 3,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
