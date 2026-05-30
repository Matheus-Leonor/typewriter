import { useEffect, useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ThemeProvider } from './theme/ThemeProvider';
import { SessionSidebar } from './sessions/SessionSidebar';
import { Editor } from './editor/Editor';
import { StatusBar } from './components/StatusBar';
import { sessionStore } from './sessions/SessionStore';
import { useSession } from './sessions/useSession';
import { db, Session } from './db';
import { CursorBlink, CursorStyle } from './editor/Editor';
import { VaultScreen } from './vault/VaultScreen';
import './theme/global.css';

interface ActiveFile {
  path: string;
  content: string;
  name: string;
}

function AppInner() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cursorStyle, setCursorStyle] = useState<CursorStyle>('line');
  const [cursorBlink, setCursorBlink] = useState<CursorBlink>('blink');
  const [ready, setReady] = useState(false);
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [recentVaultPath, setRecentVaultPath] = useState<string | null>(null);
  const [vaultChecked, setVaultChecked] = useState(false);
  const [activeFile, setActiveFile] = useState<ActiveFile | null>(null);

  // Check vault first, then load sessions
  useEffect(() => {
    async function init() {
      const savedVault = await db.settings.get('active_vault_path');
      setRecentVaultPath(savedVault);
      if (savedVault) {
        setVaultPath(savedVault);
        await loadApp();
      }
      setVaultChecked(true);
    }

    async function loadApp() {
      const [savedCursorStyle, savedCursorBlink] = await Promise.all([
        db.settings.get('cursor_style'),
        db.settings.get('cursor_blink'),
      ]);

      if (savedCursorStyle === 'line' || savedCursorStyle === 'block' || savedCursorStyle === 'underscore') {
        setCursorStyle(savedCursorStyle);
      }
      if (savedCursorBlink === 'blink' || savedCursorBlink === 'breath' || savedCursorBlink === 'none') {
        setCursorBlink(savedCursorBlink);
      }

      let list = await sessionStore.list();
      if (list.length === 0) {
        const s = await sessionStore.create();
        list = [s];
      }
      setSessions(list);
      setCurrentSession(list[0]);
      setReady(true);
    }

    init();
  }, []);

  const handleVaultReady = useCallback(async (path: string) => {
    setVaultPath(path);
    setRecentVaultPath(path);

    const [savedCursorStyle, savedCursorBlink] = await Promise.all([
      db.settings.get('cursor_style'),
      db.settings.get('cursor_blink'),
    ]);
    if (savedCursorStyle === 'line' || savedCursorStyle === 'block' || savedCursorStyle === 'underscore') {
      setCursorStyle(savedCursorStyle as CursorStyle);
    }
    if (savedCursorBlink === 'blink' || savedCursorBlink === 'breath' || savedCursorBlink === 'none') {
      setCursorBlink(savedCursorBlink as CursorBlink);
    }

    let list = await sessionStore.list();
    if (list.length === 0) {
      const s = await sessionStore.create();
      list = [s];
    }
    setSessions(list);
    setCurrentSession(list[0]);
    setReady(true);
  }, []);

  const handleOpenFile = useCallback((path: string, content: string, name: string) => {
    setActiveFile({ path, content, name });
  }, []);

  const handleSwitchVault = useCallback(async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const path = await invoke<string | null>('pick_folder');
    if (!path) return;
    await db.settings.set('active_vault_path', path);
    setVaultPath(path);
    setRecentVaultPath(path);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarOpen((o) => !o);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        handleNewSession();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const handleNewSession = useCallback(async () => {
    const s = await sessionStore.create();
    setSessions((prev) => [s, ...prev]);
    setCurrentSession(s);
  }, []);

  const handleSelectSession = useCallback((s: Session) => {
    setCurrentSession(s);
  }, []);

  const handleDeleteSession = useCallback(
    async (id: string) => {
      await sessionStore.delete(id);
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        if (currentSession?.id === id) {
          setCurrentSession(next[0] ?? null);
        }
        return next;
      });
    },
    [currentSession],
  );

  const handleSessionChange = useCallback((updated: Session) => {
    setCurrentSession(updated);
    setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }, []);

  if (!vaultChecked) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--bg-primary)',
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
          DevScribe
        </span>
      </div>
    );
  }

  if (!vaultPath) {
    return <VaultScreen recentPath={recentVaultPath} onVaultReady={handleVaultReady} />;
  }

  if (!ready) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--bg-primary)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)',
            fontSize: 'var(--text-sm)',
          }}
        >
          DevScribe
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'var(--bg-primary)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <SessionSidebar
          sessions={sessions}
          currentId={currentSession?.id}
          open={sidebarOpen}
          onSelect={(s) => { setActiveFile(null); handleSelectSession(s); }}
          onNew={() => { setActiveFile(null); handleNewSession(); }}
          onDelete={handleDeleteSession}
          vaultPath={vaultPath!}
          onOpenFile={handleOpenFile}
        />

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {activeFile ? (
            <FileEditorPane
              file={activeFile}
              cursorStyle={cursorStyle}
              cursorBlink={cursorBlink}
            />
          ) : currentSession ? (
            <EditorPane
              session={currentSession}
              onSessionChange={handleSessionChange}
              cursorStyle={cursorStyle}
              cursorBlink={cursorBlink}
            />
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
              }}
            >
              Ctrl+N para nova sessão
            </div>
          )}
        </main>
      </div>

      <StatusBar
        session={activeFile ? null : currentSession}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        cursorStyle={cursorStyle}
        cursorBlink={cursorBlink}
        onCursorStyleChange={setCursorStyle}
        onCursorBlinkChange={setCursorBlink}
        onSwitchVault={handleSwitchVault}
      />
    </div>
  );
}

function EditorPane({
  session,
  onSessionChange,
  cursorStyle,
  cursorBlink,
}: {
  session: Session;
  onSessionChange: (s: Session) => void;
  cursorStyle: CursorStyle;
  cursorBlink: CursorBlink;
}) {
  const { updateContent } = useSession(session, onSessionChange);
  const isKineticMode = session.content_type === 'free' || session.content_type === 'markdown';

  return (
    <Editor
      session={session}
      onUpdate={updateContent}
      kineticEnabled={isKineticMode}
      cursorStyle={cursorStyle}
      cursorBlink={cursorBlink}
    />
  );
}

function FileEditorPane({
  file,
  cursorStyle,
  cursorBlink,
}: {
  file: ActiveFile;
  cursorStyle: CursorStyle;
  cursorBlink: CursorBlink;
}) {
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fakeSession: Session = {
    id: file.path,
    title: file.name,
    content: file.content,
    content_type: 'markdown',
    tags: '',
    word_count: 0,
    created_at: 0,
    updated_at: 0,
  };

  const handleUpdate = useCallback((content: string) => {
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      invoke('write_file', { path: file.path, content }).catch(console.error);
    }, 500);
  }, [file.path]);

  return (
    <Editor
      session={fakeSession}
      onUpdate={handleUpdate}
      kineticEnabled={true}
      cursorStyle={cursorStyle}
      cursorBlink={cursorBlink}
    />
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}
