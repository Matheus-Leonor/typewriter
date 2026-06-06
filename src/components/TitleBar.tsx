import { useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

const win = getCurrentWindow();

export type SidebarTab = 'files' | 'search';

interface Props {
  sidebarOpen: boolean;
  sidebarTab: SidebarTab;
  onToggleSidebar: () => void;
  onOpenFiles: () => void;
  onOpenSearch: () => void;
  terminalOpen?: boolean;
  previewOpen?: boolean;
  onToggleTerminal?: () => void;
  onTogglePreview?: () => void;
}

export function TitleBar({
  sidebarOpen, sidebarTab, onToggleSidebar, onOpenFiles, onOpenSearch,
  terminalOpen, previewOpen, onToggleTerminal, onTogglePreview,
}: Props) {
  return (
    <div
      data-tauri-drag-region
      className="is-topbar"
      style={{
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Left — sidebar navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, paddingLeft: 6 }}>
        <NavBtn
          icon={sidebarOpen ? 'left_panel_close' : 'left_panel_open'}
          label={sidebarOpen ? 'Recolher painel  Ctrl+B' : 'Expandir painel  Ctrl+B'}
          active={false}
          onClick={onToggleSidebar}
        />
        <NavBtn
          icon="folder"
          label="Explorador de arquivos"
          active={sidebarOpen && sidebarTab === 'files'}
          onClick={onOpenFiles}
        />
        <NavBtn
          icon="search"
          label="Buscar"
          active={sidebarOpen && sidebarTab === 'search'}
          onClick={onOpenSearch}
        />
      </div>

      {/* Drag region spacer */}
      <div data-tauri-drag-region style={{ flex: 1 }} />

      {/* Right — panel toggles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, paddingRight: 6 }}>
        {onToggleTerminal && (
          <NavBtn
            icon="dock_to_bottom"
            label={terminalOpen ? 'Fechar terminal  Ctrl+`' : 'Terminal  Ctrl+`'}
            active={!!terminalOpen}
            onClick={onToggleTerminal}
          />
        )}
        {onTogglePreview && (
          <NavBtn
            icon={previewOpen ? 'right_panel_close' : 'right_panel_open'}
            label={previewOpen ? 'Fechar preview  Ctrl+Shift+P' : 'Preview markdown  Ctrl+Shift+P'}
            active={!!previewOpen}
            onClick={onTogglePreview}
          />
        )}
      </div>

      {/* Right — window controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, paddingRight: 4 }}>
        <WinBtn icon="remove" label="Minimizar" onClick={() => win.minimize()} />
        <WinBtn icon="crop_square" label="Maximizar" onClick={() => win.toggleMaximize()} />
        <WinBtn icon="close" label="Fechar" onClick={() => win.close()} danger />
      </div>
    </div>
  );
}

function NavBtn({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [ref, setRef] = useState<HTMLButtonElement | null>(null);

  return (
    <>
      <button
        ref={setRef}
        onClick={onClick}
        onMouseEnter={() => {
          const r = ref?.getBoundingClientRect();
          if (r) setPos({ top: r.bottom + 6, left: r.left + r.width / 2 });
        }}
        onMouseLeave={() => setPos(null)}
        style={{
          width: 30,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: active ? 'var(--accent-muted)' : 'transparent',
          border: 'none',
          borderRadius: 5,
          cursor: 'pointer',
          color: active ? 'var(--accent)' : 'var(--text-muted)',
          transition: 'background 120ms ease, color 120ms ease',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18, lineHeight: 1 }}>
          {icon}
        </span>
      </button>

      {pos && (
        <div
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            transform: 'translateX(-50%)',
            background: '#111',
            color: '#EDEDEB',
            borderRadius: 6,
            padding: '4px 9px',
            fontSize: 12,
            fontFamily: 'var(--font-ui)',
            whiteSpace: 'nowrap',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        >
          {label}
        </div>
      )}
    </>
  );
}

function WinBtn({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      title={label}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 30,
        height: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: hovered
          ? danger
            ? 'rgba(200,50,50,0.15)'
            : 'var(--bg-overlay)'
          : 'transparent',
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
        color: danger && hovered ? '#e05555' : 'var(--text-muted)',
        transition: 'background 120ms ease, color 120ms ease',
        flexShrink: 0,
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 16, lineHeight: 1 }}>
        {icon}
      </span>
    </button>
  );
}
