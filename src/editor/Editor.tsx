import { useEffect, useRef } from 'react';
import { EditorView, keymap, drawSelection } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { Session } from '../db';
import { kineticExtension } from './extensions/kineticPlugin';
import { markdownLivePreview } from './extensions/markdownLivePreview';

export type CursorStyle = 'line' | 'block' | 'underscore';
export type CursorBlink = 'blink' | 'breath' | 'none';

const editorTheme = EditorView.theme({
  '&': { height: '100%', background: 'transparent', fontSize: 'var(--text-base)' },
  '.cm-scroller': { overflow: 'auto', height: '100%', fontFamily: 'var(--font-mono)' },
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
}

export function Editor({ session, onUpdate, kineticEnabled = true, cursorStyle, cursorBlink }: EditorProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

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

  return (
    <div
      ref={shellRef}
      className="ds-editor"
      style={{ flex: 1, overflow: 'hidden', position: 'relative' }}
    />
  );
}
