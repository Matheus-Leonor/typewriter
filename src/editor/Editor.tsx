import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorView, keymap, drawSelection } from '@codemirror/view';
import { EditorSelection, EditorState } from '@codemirror/state';
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { Session } from '../db';
import { kineticExtension } from './extensions/kineticPlugin';
import { markdownLivePreview } from './extensions/markdownLivePreview';
import { tableAutocomplete } from './extensions/tableAutocomplete';
import { TablePicker } from './TablePicker';

export type CursorStyle = 'line' | 'block' | 'underscore';
export type CursorBlink = 'blink' | 'breath' | 'none';

const editorTheme = EditorView.theme({
  '&': { height: '100%', background: 'transparent', fontSize: 'var(--text-base)' },
  '.cm-scroller': { overflow: 'auto', height: '100%', fontFamily: 'var(--font-editor)' },
  '.cm-content': {
    padding: '48px 64px',
    maxWidth: '740px',
    margin: '0 auto',
    color: 'var(--text-primary)',
    caretColor: 'var(--text-primary)',
    lineHeight: '1.75',
    // Enable JetBrains Mono ligatures — works on undecorated text.
    // Where kinetic decorations split char pairs into separate spans,
    // ligatures are suppressed until the decoration moves (VS Code behaviour).
    'font-feature-settings': '"liga" 1, "calt" 1',
    'font-variant-ligatures': 'common-ligatures',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--text-primary)',
    borderLeftWidth: '2px',
  },
  '.cm-focused': { outline: 'none' },
  '.cm-line': { padding: '0' },
  '.cm-selectionBackground, .cm-focused .cm-selectionBackground': {
    background: 'var(--selection-bg)',
  },
  '& ::selection': { background: 'var(--selection-bg)' },
  // drawSelection cursor layer default colour
  '.cm-cursorLayer': { pointerEvents: 'none' },
});

interface EditorProps {
  session: Session;
  onUpdate: (content: string) => void;
  kineticEnabled?: boolean;
  cursorStyle: CursorStyle;
  cursorBlink: CursorBlink;
  onOpenJsonFormatter: () => void;
}

type ContextMenuState = {
  x: number;
  y: number;
};

type ContextMenuItem =
  | { type: 'separator' }
  | { type: 'item'; label: string; action: () => void | Promise<void> };

export function Editor({
  session,
  onUpdate,
  kineticEnabled = true,
  cursorStyle,
  cursorBlink,
  onOpenJsonFormatter,
}: EditorProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [tablePicker, setTablePicker] = useState<{ x: number; y: number } | null>(null);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const closeTablePicker = useCallback(() => setTablePicker(null), []);

  const getSelectedText = useCallback((view: EditorView) => {
    return view.state.selection.ranges
      .map((range) => view.state.sliceDoc(range.from, range.to))
      .join('\n');
  }, []);

  const insertText = useCallback((text: string) => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch(
      view.state.changeByRange((range) => ({
        changes: { from: range.from, to: range.to, insert: text },
        range: EditorSelection.cursor(range.from + text.length),
      })),
    );
    view.focus();
  }, []);

  const wrapSelection = useCallback((before: string, after = before) => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch(
      view.state.changeByRange((range) => {
        const selected = view.state.sliceDoc(range.from, range.to);
        const insert = `${before}${selected}${after}`;
        const anchor = range.empty ? range.from + before.length : range.from;
        const head = range.empty ? anchor : range.to + before.length;

        return {
          changes: { from: range.from, to: range.to, insert },
          range: EditorSelection.range(anchor, head),
        };
      }),
    );
    view.focus();
  }, []);

  const deleteSelection = useCallback(() => {
    const view = viewRef.current;
    if (!view || view.state.selection.main.empty) return;

    view.dispatch(
      view.state.changeByRange((range) => ({
        changes: { from: range.from, to: range.to, insert: '' },
        range: EditorSelection.cursor(range.from),
      })),
    );
    view.focus();
  }, []);

  const copySelection = useCallback(async () => {
    const view = viewRef.current;
    if (!view) return;

    const selected = getSelectedText(view);
    const text = selected || view.state.doc.toString();
    await navigator.clipboard.writeText(text);
    view.focus();
  }, [getSelectedText]);

  const cutSelection = useCallback(async () => {
    const view = viewRef.current;
    if (!view) return;

    const selected = getSelectedText(view);
    if (!selected) return;

    await navigator.clipboard.writeText(selected);
    deleteSelection();
  }, [deleteSelection, getSelectedText]);

  const pasteClipboard = useCallback(async () => {
    const text = await navigator.clipboard.readText();
    if (text) insertText(text);
  }, [insertText]);

  const copyPlainText = useCallback(async () => {
    const view = viewRef.current;
    if (!view) return;

    const selected = getSelectedText(view);
    const markdownText = selected || view.state.doc.toString();
    const plainText = markdownText
      .replace(/```[\s\S]*?```/g, (match) => match.replace(/```[^\n]*\n?|```/g, ''))
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_~#>]+/g, '')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '');

    await navigator.clipboard.writeText(plainText);
    view.focus();
  }, [getSelectedText]);

  const insertLink = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch(
      view.state.changeByRange((range) => {
        const selected = view.state.sliceDoc(range.from, range.to) || 'texto';
        const insert = `[${selected}](url)`;
        const urlStart = range.from + selected.length + 3;

        return {
          changes: { from: range.from, to: range.to, insert },
          range: EditorSelection.range(urlStart, urlStart + 3),
        };
      }),
    );
    view.focus();
  }, []);

  const openTablePicker = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const coords = view.coordsAtPos(view.state.selection.main.head);
    setTablePicker({ x: coords?.left ?? 0, y: (coords?.bottom ?? 0) + 4 });
  }, []);

  const handleTableInsert = useCallback((rows: number, cols: number) => {
    const view = viewRef.current;
    if (!view) return;
    setTablePicker(null);

    const headers = Array.from({ length: cols }, (_, i) => `Coluna ${i + 1}`);
    const colWidths = headers.map((h) => Math.max(h.length, 3));

    const pad = (s: string, w: number) => ` ${s.padEnd(w, ' ')} `;
    const headerLine = '|' + headers.map((h, i) => pad(h, colWidths[i])).join('|') + '|';
    const sepLine = '|' + colWidths.map((w) => '-'.repeat(w + 2)).join('|') + '|';
    const emptyLine = '|' + colWidths.map((w) => ' '.repeat(w + 2)).join('|') + '|';

    const lines = [headerLine, sepLine];
    for (let i = 1; i < rows; i++) {
      lines.push(emptyLine);
    }
    const text = lines.join('\n');

    view.dispatch(
      view.state.changeByRange((range) => ({
        changes: { from: range.from, to: range.to, insert: text },
        range: EditorSelection.cursor(range.from + text.length),
      })),
    );
    view.focus();
  }, []);

  const menuItems = useMemo<ContextMenuItem[]>(
    () => [
      { type: 'item', label: 'Cortar', action: cutSelection },
      { type: 'item', label: 'Copiar', action: copySelection },
      { type: 'item', label: 'Colar', action: pasteClipboard },
      { type: 'separator' },
      { type: 'item', label: 'Formatar como bold', action: () => wrapSelection('**') },
      { type: 'item', label: 'Formatar como italic', action: () => wrapSelection('*') },
      { type: 'item', label: 'Formatar como código', action: () => wrapSelection('`') },
      { type: 'separator' },
      { type: 'item', label: 'Copiar como Markdown', action: copySelection },
      { type: 'item', label: 'Copiar como texto puro', action: copyPlainText },
      { type: 'separator' },
      { type: 'item', label: 'Inserir link', action: insertLink },
      { type: 'item', label: 'Inserir tabela', action: openTablePicker },
      { type: 'separator' },
      { type: 'item', label: 'Formatar JSON', action: onOpenJsonFormatter },
    ],
    [
      copyPlainText,
      copySelection,
      cutSelection,
      insertLink,
      openTablePicker,
      onOpenJsonFormatter,
      pasteClipboard,
      wrapSelection,
    ],
  );

  // Listen for /tabela autocomplete event
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ left: number; top: number }>).detail;
      setTablePicker({ x: detail.left, y: detail.top });
    };
    window.addEventListener('open-table-picker', handler);
    return () => window.removeEventListener('open-table-picker', handler);
  }, []);

  // Apply cursor classes to view.dom (stable across re-renders — CM6 root element)
  useEffect(() => {
    const el = viewRef.current?.dom;
    if (!el) return;
    el.classList.remove('cursor-line', 'cursor-block', 'cursor-underscore');
    el.classList.add(`cursor-${cursorStyle}`);
    el.classList.remove('blink-blink', 'blink-breath', 'blink-none');
    el.classList.add(`blink-${cursorBlink}`);
  }, [cursorStyle, cursorBlink]);

  // Create / destroy CM6 view per session
  useEffect(() => {
    if (!shellRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: session.content,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          markdown({ extensions: [GFM] }),
          markdownLivePreview(),
          tableAutocomplete(),
          drawSelection(),    // enables .cm-cursor + .cm-cursorLayer
          editorTheme,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onUpdate(u.state.doc.toString());
          }),
          ...(kineticEnabled ? [kineticExtension()] : []),
        ],
      }),
      parent: shellRef.current,
    });

    viewRef.current = view;

    // Apply cursor prefs immediately (state already set above)
    view.dom.classList.add(`cursor-${cursorStyle}`, `blink-${cursorBlink}`);

    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, kineticEnabled]);

  // Sync external content changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== session.content) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: session.content } });
    }
  }, [session.content]);

  useEffect(() => {
    if (!contextMenu) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      closeContextMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeContextMenu();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeContextMenu, contextMenu]);

  useEffect(() => {
    if (!tablePicker) return;
    const handlePointerDown = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest('.table-picker')) return;
      closeTablePicker();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeTablePicker();
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeTablePicker, tablePicker]);

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const view = viewRef.current;
    if (!view) return;

    event.preventDefault();

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos !== null) {
      const selected = view.state.selection.ranges.some((range) => pos >= range.from && pos <= range.to);
      if (!selected) {
        view.dispatch({ selection: EditorSelection.cursor(pos) });
      }
    }

    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 232)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 376)),
    });
  }, []);

  const runMenuAction = useCallback(
    async (action: () => void | Promise<void>) => {
      closeContextMenu();
      try {
        await action();
      } catch (error) {
        console.error('Context menu action failed', error);
      }
    },
    [closeContextMenu],
  );

  return (
    <div
      className="ds-editor"
      style={{ flex: 1, overflow: 'hidden', position: 'relative' }}
      onContextMenu={handleContextMenu}
    >
      <div ref={shellRef} style={{ height: '100%' }} />
      {contextMenu && (
        <div
          ref={menuRef}
          className="ds-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
        >
          {menuItems.map((item, index) =>
            item.type === 'separator' ? (
              <div key={`separator-${index}`} className="ds-context-menu__separator" role="separator" />
            ) : (
              <button
                key={item.label}
                className="ds-context-menu__item"
                type="button"
                role="menuitem"
                onClick={() => void runMenuAction(item.action)}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
      {tablePicker && (
        <TablePicker
          left={tablePicker.x}
          top={tablePicker.y}
          onInsert={handleTableInsert}
          onClose={closeTablePicker}
        />
      )}
    </div>
  );
}
