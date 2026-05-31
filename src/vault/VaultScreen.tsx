import { invoke } from '@tauri-apps/api/core';
import { db } from '../db';

interface Props {
  recentPath: string | null;
  onVaultReady: (path: string) => void;
}

export function VaultScreen({ recentPath, onVaultReady }: Props) {
  async function pickAndSet() {
    const path = await invoke<string | null>('pick_folder');
    if (!path) return;
    await db.settings.set('active_vault_path', path);
    onVaultReady(path);
  }

  async function useRecent() {
    if (!recentPath) return;
    onVaultReady(recentPath);
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>DevScribe</h1>
        <p style={subtitleStyle}>Escolha um diretório para suas notas</p>

        <div style={buttonsStyle}>
          <button onClick={pickAndSet} style={primaryBtnStyle}>
            Criar novo vault
          </button>
          <button onClick={pickAndSet} style={secondaryBtnStyle}>
            Abrir vault existente
          </button>
        </div>

        {recentPath && (
          <div style={recentStyle}>
            <span style={recentLabelStyle}>Recente</span>
            <button onClick={useRecent} style={recentPathBtnStyle} title={recentPath}>
              {recentPath.length > 48 ? '…' + recentPath.slice(-48) : recentPath}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100vh',
  background: 'var(--bg-primary)',
};

const cardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-4)',
  padding: '48px 56px',
  background: 'var(--bg-surface)',
  border: '0.5px solid var(--border)',
  borderRadius: 8,
  minWidth: 360,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-ui)',
  fontSize: 22,
  fontWeight: 500,
  color: 'var(--text-primary)',
  letterSpacing: '-0.3px',
};

const subtitleStyle: React.CSSProperties = {
  margin: '0 0 12px',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
};

const buttonsStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  width: '100%',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'var(--accent)',
  border: 'none',
  borderRadius: 4,
  color: '#fff',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-sm)',
  cursor: 'pointer',
  fontWeight: 500,
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'transparent',
  border: '0.5px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-sm)',
  cursor: 'pointer',
};

const recentStyle: React.CSSProperties = {
  marginTop: 16,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 4,
  width: '100%',
};

const recentLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const recentPathBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--accent)',
  padding: 0,
  textAlign: 'left',
  textDecoration: 'underline',
  textDecorationStyle: 'dotted',
};
