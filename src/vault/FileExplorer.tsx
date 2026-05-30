import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
  modified: number;
  created: number;
}

type SortMode = 'name' | 'modified' | 'created';

interface ContextMenuState {
  x: number;
  y: number;
  entry: FsEntry;
}

interface Props {
  vaultPath: string;
  onOpenFile: (path: string, content: string, name: string) => void;
}

export function FileExplorer({ vaultPath, onOpenFile }: Props) {
  const [childrenMap, setChildrenMap] = useState<Map<string, FsEntry[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortMode>('name');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [creating, setCreating] = useState<{ dirPath: string; type: 'note' | 'folder' } | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const refreshDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const loadDir = useCallback(async (dirPath: string) => {
    const entries = await invoke<FsEntry[]>('list_dir', { path: dirPath });
    setChildrenMap((prev) => new Map(prev).set(dirPath, entries));
  }, []);

  const refresh = useCallback(async () => {
    const newMap = new Map<string, FsEntry[]>();
    await Promise.all(
      Array.from(childrenMap.keys()).map(async (dir) => {
        try {
          const entries = await invoke<FsEntry[]>('list_dir', { path: dir });
          newMap.set(dir, entries);
        } catch {
          // directory may have been deleted — skip it
        }
      }),
    );
    setChildrenMap(newMap);
  }, [childrenMap]);

  // Keep ref up-to-date so the watcher listener always calls the latest refresh
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });

  // Initial load
  useEffect(() => {
    loadDir(vaultPath);
  }, [vaultPath, loadDir]);

  // Start watcher and listen for changes
  useEffect(() => {
    invoke('watch_vault', { path: vaultPath }).catch(console.error);

    const unlistenPromise = listen('vault-changed', () => {
      clearTimeout(refreshDebounce.current);
      refreshDebounce.current = setTimeout(() => refreshRef.current(), 400);
    });

    return () => {
      unlistenPromise.then((f) => f());
      clearTimeout(refreshDebounce.current);
    };
  }, [vaultPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dismiss context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  // Dismiss sort menu on outside click
  useEffect(() => {
    if (!showSortMenu) return;
    const handler = () => setShowSortMenu(false);
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showSortMenu]);

  function sortEntries(entries: FsEntry[]): FsEntry[] {
    const dirs = entries.filter((e) => e.is_dir);
    const files = entries.filter((e) => !e.is_dir);
    const sorted = (arr: FsEntry[]) =>
      [...arr].sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name);
        if (sort === 'modified') return b.modified - a.modified;
        return b.created - a.created;
      });
    return [...sorted(dirs), ...sorted(files)];
  }

  async function handleOpenFile(entry: FsEntry) {
    const content = await invoke<string>('read_file', { path: entry.path });
    onOpenFile(entry.path, content, entry.name);
  }

  function toggleExpand(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        if (!childrenMap.has(path)) {
          loadDir(path);
        }
      }
      return next;
    });
  }

  async function startRename(entry: FsEntry) {
    setContextMenu(null);
    setRenamingPath(entry.path);
    setRenameValue(entry.name);
  }

  async function commitRename() {
    if (!renamingPath || !renameValue.trim()) {
      setRenamingPath(null);
      return;
    }
    const p = renamingPath;
    const isDir = childrenMap
      .get(vaultPath)
      ?.find((e) => e.path === p)?.is_dir ?? false;
    const newName = isDir || renameValue.endsWith('.md')
      ? renameValue.trim()
      : renameValue.trim() + '.md';
    const parent = p.substring(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1);
    const newPath = parent + newName;
    await invoke('rename_entry', { oldPath: p, newPath });
    setRenamingPath(null);
    await refresh();
  }

  async function handleDelete(entry: FsEntry) {
    setContextMenu(null);
    if (!confirm(`Deletar "${entry.name}"?`)) return;
    await invoke('delete_entry', { path: entry.path });
    await refresh();
  }

  async function handleDuplicate(entry: FsEntry) {
    setContextMenu(null);
    await invoke('duplicate_note', { path: entry.path });
    await refresh();
  }

  async function commitCreate() {
    if (!creating || !newItemName.trim()) {
      setCreating(null);
      return;
    }
    if (creating.type === 'note') {
      await invoke('create_note', { dirPath: creating.dirPath, name: newItemName.trim() });
    } else {
      await invoke('create_folder', { dirPath: creating.dirPath, name: newItemName.trim() });
    }
    setCreating(null);
    setNewItemName('');
    await loadDir(creating.dirPath);
    if (creating.dirPath !== vaultPath) {
      setExpanded((prev) => new Set(prev).add(creating.dirPath));
    }
  }

  const rootEntries = childrenMap.get(vaultPath) ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          padding: '6px var(--space-3)',
          borderBottom: '0.5px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <ToolBtn
          title="Nova nota"
          onClick={() => { setCreating({ dirPath: vaultPath, type: 'note' }); setNewItemName(''); }}
        >
          + Nota
        </ToolBtn>
        <ToolBtn
          title="Nova pasta"
          onClick={() => { setCreating({ dirPath: vaultPath, type: 'folder' }); setNewItemName(''); }}
        >
          + Pasta
        </ToolBtn>
        <div style={{ position: 'relative', marginLeft: 'auto' }}>
          <ToolBtn title="Ordenar" onClick={(e) => { e.stopPropagation(); setShowSortMenu((v) => !v); }}>
            Ordenar ↕
          </ToolBtn>
          {showSortMenu && (
            <div
              onMouseDown={(e) => e.stopPropagation()}
              style={dropdownStyle}
            >
              {(['name', 'modified', 'created'] as SortMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => { setSort(m); setShowSortMenu(false); }}
                  style={{ ...dropdownItemStyle, color: sort === m ? 'var(--accent)' : 'var(--text-secondary)' }}
                >
                  {m === 'name' ? 'Nome A-Z' : m === 'modified' ? 'Modificação' : 'Criação'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tree */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '4px 0' }}>
        {/* New item input at root */}
        {creating && creating.dirPath === vaultPath && (
          <NewItemInput
            type={creating.type}
            depth={0}
            value={newItemName}
            onChange={setNewItemName}
            onCommit={commitCreate}
            onCancel={() => setCreating(null)}
          />
        )}

        {sortEntries(rootEntries).map((entry) => (
          <EntryTree
            key={entry.path}
            entry={entry}
            depth={0}
            expanded={expanded}
            childrenMap={childrenMap}
            sortEntries={sortEntries}
            renamingPath={renamingPath}
            renameValue={renameValue}
            creating={creating}
            newItemName={newItemName}
            onToggleExpand={toggleExpand}
            onOpenFile={handleOpenFile}
            onContextMenu={(e, ent) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, entry: ent });
            }}
            onRenameChange={setRenameValue}
            onRenameCommit={commitRename}
            onRenameCancel={() => setRenamingPath(null)}
            onNewItemNameChange={setNewItemName}
            onNewItemCommit={commitCreate}
            onNewItemCancel={() => setCreating(null)}
          />
        ))}

        {rootEntries.length === 0 && !creating && (
          <div style={emptyStyle}>Vault vazio</div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenuPopup
          x={contextMenu.x}
          y={contextMenu.y}
          entry={contextMenu.entry}
          onRename={startRename}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

// --- EntryTree ---

interface EntryTreeProps {
  entry: FsEntry;
  depth: number;
  expanded: Set<string>;
  childrenMap: Map<string, FsEntry[]>;
  sortEntries: (e: FsEntry[]) => FsEntry[];
  renamingPath: string | null;
  renameValue: string;
  creating: { dirPath: string; type: 'note' | 'folder' } | null;
  newItemName: string;
  onToggleExpand: (path: string) => void;
  onOpenFile: (entry: FsEntry) => void;
  onContextMenu: (e: React.MouseEvent, entry: FsEntry) => void;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onNewItemNameChange: (v: string) => void;
  onNewItemCommit: () => void;
  onNewItemCancel: () => void;
}

function EntryTree({
  entry, depth, expanded, childrenMap, sortEntries,
  renamingPath, renameValue, creating, newItemName,
  onToggleExpand, onOpenFile, onContextMenu,
  onRenameChange, onRenameCommit, onRenameCancel,
  onNewItemNameChange, onNewItemCommit, onNewItemCancel,
}: EntryTreeProps) {
  const [hovered, setHovered] = useState(false);
  const isExpanded = expanded.has(entry.path);
  const children = childrenMap.get(entry.path) ?? [];

  const indent = depth * 14 + 8;

  if (renamingPath === entry.path) {
    return (
      <div style={{ paddingLeft: indent, paddingRight: 8, paddingTop: 2, paddingBottom: 2 }}>
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameCommit();
            if (e.key === 'Escape') onRenameCancel();
          }}
          onBlur={onRenameCommit}
          style={inlineInputStyle}
        />
      </div>
    );
  }

  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onContextMenu={(e) => onContextMenu(e, entry)}
        onClick={() => {
          if (entry.is_dir) {
            onToggleExpand(entry.path);
          } else {
            onOpenFile(entry);
          }
        }}
        style={{
          paddingLeft: indent,
          paddingRight: 8,
          paddingTop: 3,
          paddingBottom: 3,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          background: hovered ? 'var(--bg-overlay)' : 'transparent',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, width: 10 }}>
          {entry.is_dir ? (isExpanded ? '▾' : '▸') : '·'}
        </span>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-ui)',
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flex: 1,
          }}
        >
          {entry.is_dir ? entry.name : entry.name.replace(/\.md$/, '')}
        </span>
      </div>

      {entry.is_dir && isExpanded && (
        <>
          {creating && creating.dirPath === entry.path && (
            <NewItemInput
              type={creating.type}
              depth={depth + 1}
              value={newItemName}
              onChange={onNewItemNameChange}
              onCommit={onNewItemCommit}
              onCancel={onNewItemCancel}
            />
          )}
          {sortEntries(children).map((child) => (
            <EntryTree
              key={child.path}
              entry={child}
              depth={depth + 1}
              expanded={expanded}
              childrenMap={childrenMap}
              sortEntries={sortEntries}
              renamingPath={renamingPath}
              renameValue={renameValue}
              creating={creating}
              newItemName={newItemName}
              onToggleExpand={onToggleExpand}
              onOpenFile={onOpenFile}
              onContextMenu={onContextMenu}
              onRenameChange={onRenameChange}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
              onNewItemNameChange={onNewItemNameChange}
              onNewItemCommit={onNewItemCommit}
              onNewItemCancel={onNewItemCancel}
            />
          ))}
        </>
      )}
    </>
  );
}

// --- NewItemInput ---

function NewItemInput({
  type, depth, value, onChange, onCommit, onCancel,
}: {
  type: 'note' | 'folder';
  depth: number;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ paddingLeft: depth * 14 + 8 + 15, paddingRight: 8, paddingTop: 2, paddingBottom: 2 }}>
      <input
        autoFocus
        placeholder={type === 'note' ? 'nome-da-nota.md' : 'nome-da-pasta'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit();
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={onCommit}
        style={inlineInputStyle}
      />
    </div>
  );
}

// --- ContextMenuPopup ---

function ContextMenuPopup({
  x, y, entry, onRename, onDelete, onDuplicate, onClose,
}: {
  x: number;
  y: number;
  entry: FsEntry;
  onRename: (entry: FsEntry) => void;
  onDelete: (entry: FsEntry) => void;
  onDuplicate: (entry: FsEntry) => void;
  onClose: () => void;
}) {
  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: y,
        left: x,
        zIndex: 1000,
        background: 'var(--bg-surface)',
        border: '0.5px solid var(--border)',
        borderRadius: 6,
        padding: 4,
        minWidth: 140,
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      }}
    >
      <CtxItem onClick={() => { onRename(entry); onClose(); }}>Renomear</CtxItem>
      {!entry.is_dir && (
        <CtxItem onClick={() => { onDuplicate(entry); onClose(); }}>Duplicar</CtxItem>
      )}
      <div style={{ height: '0.5px', background: 'var(--border)', margin: '4px 0' }} />
      <CtxItem danger onClick={() => { onDelete(entry); onClose(); }}>Deletar</CtxItem>
    </div>
  );
}

function CtxItem({
  onClick, children, danger,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: hovered ? 'var(--bg-overlay)' : 'transparent',
        border: 'none',
        borderRadius: 3,
        padding: '5px 10px',
        cursor: 'pointer',
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--text-xs)',
        color: danger ? '#e05252' : 'var(--text-secondary)',
      }}
    >
      {children}
    </button>
  );
}

function ToolBtn({
  onClick, title, children,
}: {
  onClick: (e: React.MouseEvent) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'none',
        border: '0.5px solid var(--border)',
        borderRadius: 4,
        padding: '3px 8px',
        cursor: 'pointer',
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-secondary)',
      }}
    >
      {children}
    </button>
  );
}

const inlineInputStyle: React.CSSProperties = {
  background: 'var(--bg-overlay)',
  border: '0.5px solid var(--accent)',
  borderRadius: 3,
  padding: '2px 6px',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-primary)',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  marginTop: 4,
  zIndex: 100,
  background: 'var(--bg-surface)',
  border: '0.5px solid var(--border)',
  borderRadius: 6,
  padding: 4,
  minWidth: 120,
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
};

const dropdownItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  background: 'transparent',
  border: 'none',
  borderRadius: 3,
  padding: '5px 10px',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
};

const emptyStyle: React.CSSProperties = {
  padding: '16px var(--space-3)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
};
