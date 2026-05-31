import { useEffect, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { db } from '../db';
import { CursorBlink, CursorStyle } from '../editor/Editor';

interface Props {
  cursorStyle: CursorStyle;
  cursorBlink: CursorBlink;
  onCursorStyleChange: (s: CursorStyle) => void;
  onCursorBlinkChange: (b: CursorBlink) => void;
  onClose: () => void;
}

type EditorFont = 'inter' | 'ibm-plex-sans';

const FONT_MAP: Record<EditorFont, string> = {
  'inter': '"Inter", sans-serif',
  'ibm-plex-sans': '"IBM Plex Sans", sans-serif',
};

export function SettingsDialog({
  cursorStyle,
  cursorBlink,
  onCursorStyleChange,
  onCursorBlinkChange,
  onClose,
}: Props) {
  const { theme, toggleTheme } = useTheme();
  const [editorFont, setEditorFont] = useState<EditorFont>('inter');

  useEffect(() => {
    db.settings.get('editor_font').then((saved) => {
      if (saved === 'inter' || saved === 'ibm-plex-sans') {
        setEditorFont(saved);
        document.documentElement.style.setProperty('--font-editor', FONT_MAP[saved]);
      }
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleFontChange = (font: EditorFont) => {
    setEditorFont(font);
    document.documentElement.style.setProperty('--font-editor', FONT_MAP[font]);
    db.settings.set('editor_font', font);
  };

  const handleCursorStyle = (s: CursorStyle) => {
    onCursorStyleChange(s);
    db.settings.set('cursor_style', s);
  };

  const handleCursorBlink = (b: CursorBlink) => {
    onCursorBlinkChange(b);
    db.settings.set('cursor_blink', b);
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Configurações"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 380,
          background: 'var(--bg-primary)',
          border: '0.5px solid var(--border)',
          borderRadius: 8,
          zIndex: 1001,
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.28)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '10px var(--space-4)',
            borderBottom: '0.5px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              flex: 1,
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--weight-medium)',
              color: 'var(--text-secondary)',
            }}
          >
            Configurações
          </span>
          <button
            onClick={onClose}
            style={{
              width: 26,
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-overlay)',
              border: 'none',
              borderRadius: 999,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15, lineHeight: 1 }}>close</span>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {/* Aparência */}
          <section>
            <SectionTitle>Aparência</SectionTitle>
            <Row label="Tema">
              <SegmentedControl
                options={[
                  { value: 'light', label: 'Claro' },
                  { value: 'dark', label: 'Escuro' },
                ]}
                value={theme}
                onChange={() => toggleTheme()}
              />
            </Row>
            <Row label="Fonte do editor">
              <SegmentedControl
                options={[
                  { value: 'inter', label: 'Inter' },
                  { value: 'ibm-plex-sans', label: 'IBM Plex Sans' },
                ]}
                value={editorFont}
                onChange={(v) => handleFontChange(v as EditorFont)}
              />
            </Row>
          </section>

          {/* Cursor */}
          <section>
            <SectionTitle>Cursor</SectionTitle>
            <Row label="Estilo">
              <SegmentedControl
                options={[
                  { value: 'line', label: 'Linha' },
                  { value: 'block', label: 'Bloco' },
                  { value: 'underscore', label: 'Sublinhado' },
                ]}
                value={cursorStyle}
                onChange={(v) => handleCursorStyle(v as CursorStyle)}
              />
            </Row>
            <Row label="Animação">
              <SegmentedControl
                options={[
                  { value: 'blink', label: 'Piscar' },
                  { value: 'breath', label: 'Respirar' },
                  { value: 'none', label: 'Nenhuma' },
                ]}
                value={cursorBlink}
                onChange={(v) => handleCursorBlink(v as CursorBlink)}
              />
            </Row>
          </section>
        </div>
      </div>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--weight-medium)',
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        marginBottom: 'var(--space-3)',
      }}
    >
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        marginBottom: 'var(--space-3)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-secondary)',
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        background: 'var(--bg-overlay)',
        border: '0.5px solid var(--border)',
        borderRadius: 6,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            background: value === opt.value ? 'var(--accent-muted)' : 'transparent',
            border: 'none',
            borderRight: '0.5px solid var(--border)',
            color: value === opt.value ? 'var(--accent)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
            fontSize: 'var(--text-xs)',
            padding: '4px 10px',
            transition: 'background 120ms ease, color 120ms ease',
            whiteSpace: 'nowrap',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
