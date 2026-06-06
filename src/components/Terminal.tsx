import { useEffect, useRef, useState } from 'react';

/* ============================================================================
   Terminal — ilha visual do terminal (Island design system).
   ⚠️ Shell VISUAL apenas: ainda nao executa comandos. A execucao real depende
   de um backend PTY em Rust (task cadenza separada). O input ecoa a linha e
   sinaliza que a execucao chega com o PTY — nada e fingido como funcional.
   ========================================================================== */

interface Line {
  kind: 'prompt' | 'echo' | 'note';
  text: string;
}

interface Props {
  cwdLabel?: string;
  onClose: () => void;
}

export function Terminal({ cwdLabel = 'typewriter', onClose }: Props) {
  const [lines, setLines] = useState<Line[]>([
    { kind: 'note', text: 'Terminal visual — execucao de comandos chega com o backend PTY.' },
  ]);
  const [input, setInput] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [lines]);

  const submit = () => {
    const cmd = input.trim();
    if (!cmd) return;
    setLines((prev) => [
      ...prev,
      { kind: 'echo', text: cmd },
      { kind: 'note', text: 'PTY ainda nao conectado — comando nao executado.' },
    ]);
    setInput('');
  };

  return (
    <div className="is-island is-term">
      <div className="is-term-tabs">
        <span className="is-term-tab-active">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>terminal</span>
          Terminal
        </span>
        <div style={{ flex: 1 }} />
        <button className="is-term-btn" title="Fechar terminal" onClick={onClose}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
        </button>
      </div>

      <div className="is-term-body" ref={bodyRef} onClick={() => inputRef.current?.focus()}>
        {lines.map((l, i) => (
          <div key={i}>
            {l.kind === 'prompt' && <span className="pfx">→ {cwdLabel}</span>}
            {l.kind === 'echo' && (
              <>
                <span className="pfx">→ {cwdLabel}</span> {l.text}
              </>
            )}
            {l.kind === 'note' && <span className="dim">{l.text}</span>}
          </div>
        ))}
        <div className="is-term-inputline">
          <span className="pfx">→ {cwdLabel}</span>
          <input
            ref={inputRef}
            className="is-term-input"
            value={input}
            autoFocus
            spellCheck={false}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submit(); }
            }}
          />
        </div>
      </div>
    </div>
  );
}
