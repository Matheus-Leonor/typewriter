import { Session } from '../db';

interface Props {
  session: Session | null;
}

export function StatusBar({ session }: Props) {
  return (
    <div
      className="ds-status-bar is-status"
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
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
