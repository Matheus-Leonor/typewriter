import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { nanoid } from 'nanoid';
import { db, Todo, TodoList } from '../db';

interface Props {
  onClose: () => void;
  vaultPath?: string;
}

export function TaskListsDialog({ onClose, vaultPath }: Props) {
  const [lists, setLists] = useState<TodoList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadLists = useCallback(async () => {
    setError('');
    try {
      setLists(await db.todos.listLists());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const expandedList = useMemo(
    () => lists.find((list) => list.id === expandedId) ?? null,
    [expandedId, lists],
  );

  const handleCreateList = useCallback(async () => {
    const title = newListTitle.trim();
    if (!title) return;
    const list = await db.todos.createList(`todo-list-${nanoid(10)}`, title);
    setLists((prev) => [list, ...prev]);
    setNewListTitle('');
    setCreating(false);
    setExpandedId(list.id);
  }, [newListTitle]);

  const refreshList = useCallback(async () => {
    setLists(await db.todos.listLists());
  }, []);

  const handleToggleTodo = useCallback(
    async (todo: Todo) => {
      await db.todos.toggle(todo.id);
      await refreshList();
    },
    [refreshList],
  );

  const handleAddTodo = useCallback(
    async (listId: string, title: string) => {
      const cleanTitle = title.trim();
      if (!cleanTitle) return;
      await db.todos.create(`todo-${nanoid(10)}`, cleanTitle, undefined, 0, listId);
      await refreshList();
    },
    [refreshList],
  );

  const handleUpdateListTitle = useCallback(
    async (listId: string, title: string) => {
      const cleanTitle = title.trim();
      if (!cleanTitle) return;
      const updated = await db.todos.updateListTitle(listId, cleanTitle);
      setLists((prev) => prev.map((list) => (list.id === listId ? updated : list)));
    },
    [],
  );

  const handleUpdateTodoTitle = useCallback(
    async (todoId: string, title: string) => {
      const cleanTitle = title.trim();
      if (!cleanTitle) return;
      await db.todos.updateTitle(todoId, cleanTitle);
      await refreshList();
    },
    [refreshList],
  );

  const handleDeleteList = useCallback(
    async (listId: string) => {
      await db.todos.deleteList(listId);
      setLists((prev) => prev.filter((l) => l.id !== listId));
      if (expandedId === listId) setExpandedId(null);
    },
    [expandedId],
  );

  const handleExportToNote = useCallback(
    async (list: TodoList) => {
      if (!vaultPath) return;
      try {
        const filePath = await invoke<string | null>('pick_file', { vaultPath });
        if (!filePath) return;
        const existing = await invoke<string>('read_file', { path: filePath });
        const md = listToMarkdown(list);
        const updated = existing ? `${existing}\n\n${md}` : md;
        await invoke('write_file', { path: filePath, content: updated });
      } catch (err) {
        console.error(err);
      }
    },
    [vaultPath],
  );

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          zIndex: 1000,
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tarefas"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(760px, calc(100vw - 32px))',
          height: 'min(560px, calc(100vh - 48px))',
          background: 'var(--bg-primary)',
          border: '0.5px solid var(--border)',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1001,
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.22)',
        }}
      >
        <header
          style={{
            padding: '9px var(--space-4)',
            borderBottom: '0.5px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <strong
            style={{
              flex: 1,
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--weight-medium)',
              color: 'var(--text-secondary)',
            }}
          >
            Tarefas
          </strong>
          {/* Close — circle button */}
          <button title="Fechar" onClick={onClose} style={closeCircleStyle}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, lineHeight: 1 }}>
              close
            </span>
          </button>
        </header>

        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Action bar with + button */}
          <div
            style={{
              padding: '6px var(--space-4)',
              borderBottom: '0.5px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              background: 'var(--bg-surface)',
              flexShrink: 0,
            }}
          >
            <button
              title="Nova lista"
              onClick={() => {
                setCreating(true);
                setExpandedId(null);
              }}
              style={newListBtnStyle}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16, lineHeight: 1 }}>
                add
              </span>
              Nova lista
            </button>
          </div>

          <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
            <section
              style={{
                flex: expandedList ? '0 0 48%' : 1,
                minWidth: 0,
                overflow: 'auto',
                padding: 'var(--space-4)',
                background: 'var(--bg-surface)',
              }}
            >
              {loading ? (
                <EmptyState label="Carregando..." />
              ) : error ? (
                <EmptyState label={error} />
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: expandedList ? '1fr' : 'repeat(auto-fill, minmax(180px, 1fr))',
                    gap: 'var(--space-3)',
                    alignItems: 'start',
                  }}
                >
                  {creating && (
                    <NewListCard
                      value={newListTitle}
                      onChange={setNewListTitle}
                      onSubmit={handleCreateList}
                      onCancel={() => {
                        setCreating(false);
                        setNewListTitle('');
                      }}
                    />
                  )}

                  {lists.map((list) => (
                    <TodoListCard
                      key={list.id}
                      list={list}
                      active={list.id === expandedId}
                      onClick={() => setExpandedId(list.id)}
                      onToggleTodo={handleToggleTodo}
                      onDelete={handleDeleteList}
                    />
                  ))}

                  {lists.length === 0 && !creating && <EmptyState label="Nenhuma lista" />}
                </div>
              )}
            </section>

            {expandedList && (
              <TaskListEditor
                list={expandedList}
                onClose={() => setExpandedId(null)}
                onAddTodo={handleAddTodo}
                onToggleTodo={handleToggleTodo}
                onUpdateListTitle={handleUpdateListTitle}
                onUpdateTodoTitle={handleUpdateTodoTitle}
                onExportToNote={vaultPath ? () => handleExportToNote(expandedList) : undefined}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function listToMarkdown(list: TodoList): string {
  const header = `## ${list.title}`;
  const items = list.todos
    .map((t) => `- [${t.done ? 'x' : ' '}] ${t.title}`)
    .join('\n');
  return items ? `${header}\n\n${items}` : header;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NewListCard({
  value,
  onChange,
  onSubmit,
  onCancel,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <article style={cardStyle(false, true)}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="Nome da lista"
        style={titleInputStyle}
      />
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
        <button onClick={onSubmit} style={primaryButtonStyle}>
          Criar
        </button>
        <button onClick={onCancel} style={ghostButtonStyle}>
          Cancelar
        </button>
      </div>
    </article>
  );
}

function TodoListCard({
  list,
  active,
  onClick,
  onToggleTodo,
  onDelete,
}: {
  list: TodoList;
  active: boolean;
  onClick: () => void;
  onToggleTodo: (todo: Todo) => void;
  onDelete: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const done = list.completed_at !== null;
  const preview = list.todos.slice(0, 5);

  return (
    <article
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...cardStyle(done, active), position: 'relative' }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-2)',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-ui)',
            fontSize: 'var(--text-md)',
            fontWeight: 'var(--weight-medium)',
            color: done ? 'var(--text-muted)' : 'var(--text-primary)',
            textDecoration: done ? 'line-through' : 'none',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {list.title}
        </h2>
        {done && <span style={completeBadgeStyle}>hoje</span>}
        {hovered && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(list.id); }}
            title="Excluir lista"
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              width: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-overlay)',
              border: 'none',
              borderRadius: 999,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14, lineHeight: 1 }}>close</span>
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {preview.map((todo) => (
          <div
            key={todo.id}
            onClick={(e) => e.stopPropagation()}
            style={todoPreviewRowStyle}
          >
            <button
              type="button"
              aria-label={todo.done ? 'Marcar tarefa como pendente' : 'Marcar tarefa como concluida'}
              aria-pressed={todo.done}
              onClick={() => onToggleTodo(todo)}
              style={todoCircleButtonStyle(todo.done, 'compact')}
            />
            <span style={todoTitleStyle(todo.done, true)}>
              {todo.title}
            </span>
          </div>
        ))}
        {list.todos.length === 0 && (
          <span
            style={{
              ...mutedTextStyle,
              paddingLeft: 'calc(14px + var(--space-2))',
            }}
          >
            Sem tarefas
          </span>
        )}
        {list.todos.length > preview.length && (
          <span style={mutedTextStyle}>+{list.todos.length - preview.length} tarefas</span>
        )}
      </div>
    </article>
  );
}

function TaskListEditor({
  list,
  onClose,
  onAddTodo,
  onToggleTodo,
  onUpdateListTitle,
  onUpdateTodoTitle,
  onExportToNote,
}: {
  list: TodoList;
  onClose: () => void;
  onAddTodo: (listId: string, title: string) => void;
  onToggleTodo: (todo: Todo) => void;
  onUpdateListTitle: (listId: string, title: string) => void;
  onUpdateTodoTitle: (todoId: string, title: string) => void;
  onExportToNote?: () => void;
}) {
  const [titleDraft, setTitleDraft] = useState(list.title);
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [todoDrafts, setTodoDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setTitleDraft(list.title);
    setTodoDrafts(Object.fromEntries(list.todos.map((todo) => [todo.id, todo.title])));
  }, [list]);

  const submitNewTodo = () => {
    const title = newTodoTitle.trim();
    if (!title) return;
    onAddTodo(list.id, title);
    setNewTodoTitle('');
  };

  return (
    <aside
      style={{
        flex: '1 1 52%',
        minWidth: 280,
        borderLeft: '0.5px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg-primary)',
      }}
    >
      {/* Editor header with chevron collapse and title */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          padding: 'var(--space-3) var(--space-4)',
          borderBottom: '0.5px solid var(--border)',
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          aria-label="Recolher painel"
          onClick={onClose}
          title="Recolher"
          style={chevronBtnStyle}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18, lineHeight: 1 }}>
            chevron_left
          </span>
        </button>
        <input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => onUpdateListTitle(list.id, titleDraft)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          style={{ ...titleInputStyle, fontSize: 'var(--text-md)', flex: 1 }}
        />
        {onExportToNote && (
          <button
            type="button"
            title="Exportar para nota"
            onClick={onExportToNote}
            style={chevronBtnStyle}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18, lineHeight: 1 }}>
              upload_file
            </span>
          </button>
        )}
      </div>

      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        {list.todos.map((todo) => (
          <div key={todo.id} style={todoEditorRowStyle}>
            <button
              type="button"
              aria-label={todo.done ? 'Marcar tarefa como pendente' : 'Marcar tarefa como concluida'}
              aria-pressed={todo.done}
              onClick={() => onToggleTodo(todo)}
              style={todoCircleButtonStyle(todo.done, 'regular')}
            />
            <input
              value={todoDrafts[todo.id] ?? todo.title}
              onChange={(e) => setTodoDrafts((prev) => ({ ...prev, [todo.id]: e.target.value }))}
              onBlur={(e) => onUpdateTodoTitle(todo.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              style={todoEditInputStyle(todo.done)}
            />
          </div>
        ))}

        {/* New todo — Enter to add */}
        <div style={todoEditorRowStyle}>
          <div style={{ width: 16, height: 16, flex: '0 0 16px', borderRadius: 999, border: '1px dashed var(--text-muted)' }} />
          <input
            value={newTodoTitle}
            onChange={(e) => setNewTodoTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNewTodo();
            }}
            placeholder="Nova tarefa"
            style={newTodoInputStyle}
          />
        </div>
      </div>
    </aside>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div
      style={{
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--text-sm)',
        padding: 'var(--space-3)',
      }}
    >
      {label}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const closeCircleStyle: CSSProperties = {
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--bg-overlay)',
  border: 'none',
  borderRadius: 999,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  flexShrink: 0,
};

const newListBtnStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  background: 'none',
  border: '0.5px solid var(--border)',
  borderRadius: 5,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-sm)',
  padding: '4px 10px',
};

const cardStyle = (complete: boolean, active: boolean): CSSProperties => ({
  background: active ? 'var(--bg-primary)' : complete ? 'var(--accent-muted)' : 'var(--bg-primary)',
  border: active ? '0.5px solid var(--accent)' : '0.5px solid var(--border)',
  borderRadius: 6,
  padding: 'var(--space-3)',
  minHeight: 118,
  cursor: 'pointer',
  boxShadow: active ? '0 0 0 1px var(--accent-muted)' : 'none',
  opacity: complete ? 0.82 : 1,
});

const titleInputStyle: CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-md)',
  fontWeight: 'var(--weight-medium)',
};

const todoPreviewRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  minWidth: 0,
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-sm)',
  fontFamily: 'var(--font-ui)',
};

const todoEditorRowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  alignItems: 'center',
  minWidth: 0,
  padding: '3px 0',
};

const todoCircleButtonStyle = (done: boolean, size: 'compact' | 'regular'): CSSProperties => {
  const diameter = size === 'compact' ? 14 : 16;
  return {
    width: diameter,
    height: diameter,
    flex: `0 0 ${diameter}px`,
    borderRadius: 999,
    border: `1px solid ${done ? 'var(--accent)' : 'var(--text-muted)'}`,
    background: done ? 'var(--accent)' : 'transparent',
    color: done ? 'var(--bg-primary)' : 'transparent',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    padding: 0,
  };
};

const todoTitleStyle = (done: boolean, truncate = false): CSSProperties => ({
  minWidth: 0,
  color: done ? 'var(--text-muted)' : 'var(--text-secondary)',
  textDecoration: done ? 'line-through' : 'none',
  overflow: truncate ? 'hidden' : 'visible',
  textOverflow: truncate ? 'ellipsis' : 'clip',
  whiteSpace: truncate ? 'nowrap' : 'normal',
});

const todoEditInputStyle = (done: boolean): CSSProperties => ({
  width: '100%',
  minWidth: 0,
  background: 'transparent',
  border: 'none',
  color: done ? 'var(--text-muted)' : 'var(--text-primary)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-sm)',
  padding: '4px 0',
  outline: 'none',
  textDecoration: done ? 'line-through' : 'none',
});

const newTodoInputStyle: CSSProperties = {
  width: '100%',
  minWidth: 0,
  background: 'transparent',
  border: 'none',
  borderBottom: '0.5px solid var(--border)',
  borderRadius: 0,
  padding: '4px 0',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-sm)',
  outline: 'none',
};

const primaryButtonStyle: CSSProperties = {
  background: 'var(--accent-muted)',
  border: '0.5px solid var(--border)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  borderRadius: 4,
  padding: '5px 10px',
};

const ghostButtonStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  padding: '5px 8px',
};

const chevronBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 4,
  padding: 3,
  flexShrink: 0,
};

const completeBadgeStyle: CSSProperties = {
  color: 'var(--accent)',
  background: 'var(--accent-muted)',
  borderRadius: 999,
  padding: '1px 7px',
  fontSize: 'var(--text-xs)',
  fontFamily: 'var(--font-ui)',
  flexShrink: 0,
};

const mutedTextStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-sm)',
  fontFamily: 'var(--font-ui)',
};
