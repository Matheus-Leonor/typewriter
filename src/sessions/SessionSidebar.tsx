import { useCallback, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileExplorer } from '../vault/FileExplorer';
import { SidebarTab } from '../components/TitleBar';

type SortMode = 'name' | 'modified' | 'created';

interface Props {
  open: boolean;
  tab: SidebarTab;
  vaultPath: string;
  activePath?: string | null;
  onOpenFile: (path: string, content: string, name: string) => void;
  onOpenJsonFormatter: () => void;
  onOpenTaskLists: () => void;
  onOpenSettings: () => void;
  onOpenAgentConfig: () => void;
}

export function SessionSidebar({
  open,
  tab,
  vaultPath,
  activePath,
  onOpenFile,
  onOpenJsonFormatter,
  onOpenTaskLists,
  onOpenSettings,
  onOpenAgentConfig,
}: Props) {
  const [fileQuery, setFileQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('name');

  const handleNewNote = useCallback(async () => {
    try { await invoke('create_note', { dirPath: vaultPath, name: 'Sem título.md' }); }
    catch (err) { console.error(err); }
  }, [vaultPath]);

  const handleNewFolder = useCallback(async () => {
    try { await invoke('create_folder', { dirPath: vaultPath, name: 'Nova Pasta' }); }
    catch (err) { console.error(err); }
  }, [vaultPath]);

  const cycleSort = useCallback(() => {
    setSort((s) => s === 'name' ? 'modified' : s === 'modified' ? 'created' : 'name');
  }, []);

  return (
    <aside
      className="ds-sidebar is-sidebar"
      style={{
        flexDirection: 'row',
      }}
    >
      {/* Vertical icon ribbon — utility tools only */}
      <div
        style={{
          width: 48,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          borderRight: open ? `0.5px solid var(--border)` : 'none',
          paddingTop: 'var(--space-2)',
          paddingBottom: 'var(--space-3)',
          gap: 2,
        }}
      >
        <div style={{ flex: 1 }} />
        <RailButton icon="smart_toy" label="Agent Config  Ctrl+Shift+G" onClick={onOpenAgentConfig} />
        <RailButton icon="checklist" label="Tarefas" onClick={onOpenTaskLists} />
        <RailButton icon="data_object" label="JSON Formatter  Ctrl+Shift+J" onClick={onOpenJsonFormatter} />
        <div style={{ height: 4 }} />
        <RailButton icon="settings" label="Configurações" onClick={onOpenSettings} />
      </div>

      {/* Collapsible content panel */}
      <div
        style={{
          width: open ? 220 : 0,
          minWidth: open ? 220 : 0,
          overflow: 'hidden',
          transition: 'width 200ms ease, min-width 200ms ease',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Panel action header */}
        {open && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0 var(--space-2)',
              borderBottom: '0.5px solid var(--border)',
              height: 36,
              flexShrink: 0,
              gap: 2,
            }}
          >
            <span
              style={{
                flex: 1,
                fontFamily: 'var(--font-ui)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
                paddingLeft: 'var(--space-1)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {tab === 'files' ? 'Arquivos' : 'Buscar'}
            </span>
            {tab === 'files' && (
              <>
                <ActionIconBtn icon="note_add" label="Nova nota" onClick={handleNewNote} />
                <ActionIconBtn icon="create_new_folder" label="Nova pasta" onClick={handleNewFolder} />
                <ActionIconBtn
                  icon="sort"
                  label={`Ordenar: ${sort === 'name' ? 'nome' : sort === 'modified' ? 'modificado' : 'criado'}`}
                  onClick={cycleSort}
                />
              </>
            )}
          </div>
        )}

        {/* Panel content */}
        {tab === 'files' && (
          <FileExplorer vaultPath={vaultPath} onOpenFile={onOpenFile} externalSort={sort} activePath={activePath} />
        )}

        {tab === 'search' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div style={{ padding: 'var(--space-3)', borderBottom: '0.5px solid var(--border)', flexShrink: 0 }}>
              <input
                value={fileQuery}
                onChange={(e) => setFileQuery(e.target.value)}
                placeholder="Buscar arquivos..."
                autoFocus
                style={{
                  width: '100%',
                  background: 'var(--bg-overlay)',
                  border: `0.5px solid var(--border)`,
                  borderRadius: 6,
                  padding: 'var(--space-2) var(--space-3)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-ui)',
                  fontSize: 'var(--text-sm)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2)' }}>
              {fileQuery.trim() ? (
                <SearchResults vaultPath={vaultPath} query={fileQuery} onOpenFile={onOpenFile} />
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-ui)', padding: 'var(--space-3) var(--space-2)' }}>
                  Digite para buscar
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

// ── Search results ────────────────────────────────────────────────────────────

interface FsEntry { name: string; path: string; is_dir: boolean; }

function SearchResults({ vaultPath, query, onOpenFile }: { vaultPath: string; query: string; onOpenFile: (path: string, content: string, name: string) => void }) {
  const [results, setResults] = useState<FsEntry[]>([]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const searchRef = useRef<string>('');
  searchRef.current = query;

  useState(() => {
    if (!query.trim()) { setResults([]); return; }
    invoke<FsEntry[]>('list_dir', { path: vaultPath }).then((entries) => {
      if (searchRef.current === query) {
        setResults(entries.filter((e) => !e.is_dir && e.name.toLowerCase().includes(query.toLowerCase())));
      }
    }).catch(() => {});
  });

  if (results.length === 0 && query.trim()) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-ui)', padding: 'var(--space-2)' }}>Nenhum resultado</div>;
  }

  return (
    <>
      {results.map((entry) => (
        <button
          key={entry.path}
          onClick={async () => {
            const content = await invoke<string>('read_file', { path: entry.path });
            onOpenFile(entry.path, content, entry.name);
          }}
          style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '7px var(--space-2)', borderRadius: 4, fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}
        >
          {entry.name.replace(/\.md$/, '')}
        </button>
      ))}
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RailButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [ref, setRef] = useState<HTMLButtonElement | null>(null);

  return (
    <>
      <button
        ref={setRef}
        onClick={onClick}
        onMouseEnter={() => {
          const r = ref?.getBoundingClientRect();
          if (r) setPos({ top: r.top + r.height / 2, left: r.right + 8 });
        }}
        onMouseLeave={() => setPos(null)}
        style={{
          width: 36,
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          borderRadius: 6,
          transition: 'color 120ms ease',
          flexShrink: 0,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{icon}</span>
      </button>
      {pos && (
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translateY(-50%)', background: '#111', color: '#EDEDEB', borderRadius: 6, padding: '4px 9px', fontSize: 12, fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap', zIndex: 9999, pointerEvents: 'none' }}>
          {label}
        </div>
      )}
    </>
  );
}

function ActionIconBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [ref, setRef] = useState<HTMLButtonElement | null>(null);

  return (
    <>
      <button
        ref={setRef}
        onClick={onClick}
        onMouseEnter={() => {
          const r = ref?.getBoundingClientRect();
          if (r) setPos({ top: r.bottom + 6, left: r.left + r.width / 2 });
        }}
        onMouseLeave={() => setPos(null)}
        style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 5, cursor: 'pointer', color: 'var(--text-muted)' }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 17 }}>{icon}</span>
      </button>
      {pos && (
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translateX(-50%)', background: '#111', color: '#EDEDEB', borderRadius: 6, padding: '4px 9px', fontSize: 12, fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap', zIndex: 9999, pointerEvents: 'none' }}>
          {label}
        </div>
      )}
    </>
  );
}
