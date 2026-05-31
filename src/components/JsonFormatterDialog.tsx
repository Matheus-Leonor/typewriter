import { useState, useEffect, useRef, useCallback } from 'react';
import { formatJson, tokenize, Token } from './jsonFormatter';

interface Props {
  onClose: () => void;
}

type Mode = 'editing' | 'formatted';

export function JsonFormatterDialog({ onClose }: Props) {
  const [input, setInput] = useState('');
  const [tokens, setTokens] = useState<Token[]>([]);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<Mode>('editing');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleFormat = useCallback(() => {
    const result = formatJson(input);
    if (result.ok) {
      setInput(result.output);
      setTokens(tokenize(result.output));
      setError('');
      setMode('formatted');
    } else {
      setTokens([]);
      setError(result.error);
      setMode('editing');
    }
  }, [input]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleFormat();
      }
    },
    [handleFormat],
  );

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(input).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [input]);

  const handleBackToEdit = useCallback(() => {
    setMode('editing');
    setTokens([]);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  return (
    <>
      {/* Backdrop — click to close */}
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
        aria-label="JSON Formatter"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 560,
          height: 440,
          background: 'var(--bg-primary)',
          border: '0.5px solid var(--border)',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1001,
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '8px var(--space-4)',
            borderBottom: '0.5px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              flex: 1,
            }}
          >
            json formatter
          </span>
          {mode === 'formatted' && (
            <button onClick={handleBackToEdit} style={ghostBtnStyle}>
              Editar
            </button>
          )}
          <span
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              opacity: 0.4,
            }}
          >
            Ctrl+Enter formata · Esc fecha
          </span>
        </div>

        {/* Body — single pane */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          {mode === 'editing' ? (
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={'Cole JSON ou objeto aqui…\n\nCtrl+Enter para formatar'}
              spellCheck={false}
              style={{
                flex: 1,
                resize: 'none',
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
                padding: 'var(--space-4)',
                lineHeight: 1.6,
              }}
            />
          ) : (
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                padding: 'var(--space-4)',
                background: 'transparent',
              }}
            >
              {error ? (
                <pre
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--text-muted)',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    margin: 0,
                  }}
                >
                  {error}
                </pre>
              ) : (
                <pre
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-sm)',
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  {tokens.map((tok, idx) => (
                    <span key={idx} style={tokenStyle(tok)}>
                      {tok.text}
                    </span>
                  ))}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '6px var(--space-4)',
            borderTop: '0.5px solid var(--border)',
            background: 'var(--bg-surface)',
            display: 'flex',
            gap: 'var(--space-2)',
            flexShrink: 0,
          }}
        >
          {mode === 'editing' ? (
            <button onClick={handleFormat} style={actionBtnStyle}>
              Formatar
            </button>
          ) : (
            <button onClick={handleCopy} style={actionBtnStyle}>
              {copied ? 'Copiado ✓' : 'Copiar'}
            </button>
          )}
          <button onClick={onClose} style={ghostBtnStyle}>
            Fechar
          </button>
        </div>
      </div>
    </>
  );
}

function tokenStyle(tok: Token): React.CSSProperties {
  switch (tok.type) {
    case 'key':     return { color: 'var(--text-primary)' };
    case 'string':  return { color: 'var(--text-secondary)' };
    case 'number':  return { color: 'var(--text-secondary)', opacity: 0.85 };
    case 'boolean': return { color: 'var(--text-secondary)', opacity: 0.8 };
    case 'null':    return { color: 'var(--text-muted)' };
    case 'punct':   return { color: 'var(--text-muted)' };
    default:        return {};
  }
}

const actionBtnStyle: React.CSSProperties = {
  background: 'var(--accent-muted)',
  border: '0.5px solid var(--border)',
  cursor: 'pointer',
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-xs)',
  fontFamily: 'var(--font-ui)',
  padding: '3px 10px',
  borderRadius: 3,
};

const ghostBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  fontSize: 'var(--text-xs)',
  fontFamily: 'var(--font-ui)',
  padding: '3px 8px',
  borderRadius: 3,
};
