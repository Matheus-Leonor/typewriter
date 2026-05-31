import { Session } from '../db';

interface Props {
  session: Session | null;
}

export function StatusBar({ session }: Props) {
  return (
    <div
      className="ds-status-bar"
      style={{
        height: 26,
        flexShrink: 0,
        borderTop: `0.5px solid var(--border)`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 var(--space-4)',
        gap: 'var(--space-4)',
        background: 'var(--bg-primary)',
      }}
    >
      <div style={{ flex: 1 }} />

      {session && (
        <span style={labelStyle}>
          {session.word_count} {session.word_count === 1 ? 'palavra' : 'palavras'}
        </span>
      )}

      {session && (
        <span style={{ ...labelStyle, opacity: 0.5 }}>
          {session.content_type}
        </span>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-ui)',
};
