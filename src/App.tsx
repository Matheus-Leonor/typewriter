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
import { ensureAgentWorkspaceStructure } from './vault/agentWorkspace';
import { JsonFormatterDialog } from './components/JsonFormatterDialog';
import { TaskListsDialog } from './components/TaskListsDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { AgentConfigDialog } from './components/AgentConfigDialog';
import { TitleBar, SidebarTab } from './components/TitleBar';
import './theme/global.css';

interface ActiveFile {
  path: string;
  content: string;
  name: string;
}

function AppInner() {
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('files');
  const [cursorStyle, setCursorStyle] = useState<CursorStyle>('line');
  const [cursorBlink, setCursorBlink] = useState<CursorBlink>('blink');
  const [ready, setReady] = useState(false);
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [recentVaultPath, setRecentVaultPath] = useState<string | null>(null);
  const [vaultChecked, setVaultChecked] = useState(false);
  const [activeFile, setActiveFile] = useState<ActiveFile | null>(null);
  const [jsonDialogOpen, setJsonDialogOpen] = useState(false);
  const [taskListsDialogOpen, setTaskListsDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [agentConfigOpen, setAgentConfigOpen] = useState(false);

  useEffect(() => {
    async function init() {
      const savedVault = await db.settings.get('active_vault_path');
      setRecentVaultPath(savedVault);
      if (savedVault) {
        setVaultPath(savedVault);
        await ensureAgentWorkspaceStructure(savedVault).catch(console.error);
        await loadApp();
      }
      setVaultChecked(true);
    }

    async function loadApp() {
      const [savedCursorStyle, savedCursorBlink, savedFont] = await Promise.all([
        db.settings.get('cursor_style'),
        db.settings.get('cursor_blink'),
        db.settings.get('editor_font'),
      ]);

      if (savedCursorStyle === 'line' || savedCursorStyle === 'block' || savedCursorStyle === 'underscore') {
        setCursorStyle(savedCursorStyle);
      }
      if (savedCursorBlink === 'blink' || savedCursorBlink === 'breath' || savedCursorBlink === 'none') {
        setCursorBlink(savedCursorBlink);
      }
      if (savedFont === 'ibm-plex-sans') {
        document.documentElement.style.setProperty('--font-editor', '"IBM Plex Sans", sans-serif');
      }

      let list = await sessionStore.list();
      if (list.length === 0) {
        const s = await sessionStore.create();
        list = [s];
      }
      setCurrentSession(list[0]);
      setReady(true);
    }

    init();
  }, []);

  const handleVaultReady = useCallback(async (path: string) => {
    setVaultPath(path);
    setRecentVaultPath(path);
    await ensureAgentWorkspaceStructure(path).catch(console.error);

    const [savedCursorStyle, savedCursorBlink, savedFont] = await Promise.all([
      db.settings.get('cursor_style'),
      db.settings.get('cursor_blink'),
      db.settings.get('editor_font'),
    ]);
    if (savedCursorStyle === 'line' || savedCursorStyle === 'block' || savedCursorStyle === 'underscore') {
      setCursorStyle(savedCursorStyle as CursorStyle);
    }
    if (savedCursorBlink === 'blink' || savedCursorBlink === 'breath' || savedCursorBlink === 'none') {
      setCursorBlink(savedCursorBlink as CursorBlink);
    }
    if (savedFont === 'ibm-plex-sans') {
      document.documentElement.style.setProperty('--font-editor', '"IBM Plex Sans", sans-serif');
    }

    let list = await sessionStore.list();
    if (list.length === 0) {
      const s = await sessionStore.create();
      list = [s];
    }
    setCurrentSession(list[0]);
    setReady(true);
  }, []);

  const handleOpenFile = useCallback((path: string, content: string, name: string) => {
    setActiveFile({ path, content, name });
  }, []);

  // Ctrl+B toggles sidebar; Ctrl+Shift+J opens JSON formatter
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'b') {
        e.preventDefault();
        setSidebarOpen((o) => !o);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'J') {
        e.preventDefault();
        setJsonDialogOpen((o) => !o);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        setAgentConfigOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const handleSessionChange = useCallback((updated: Session) => {
    setCurrentSession(updated);
  }, []);

  const handleOpenFiles = useCallback(() => {
    setSidebarTab('files');
    setSidebarOpen((open) => {
      if (!open) return true;
      return true;
    });
  }, []);

  const handleOpenSearch = useCallback(() => {
    setSidebarTab('search');
    setSidebarOpen(true);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((o) => !o);
  }, []);

  if (!vaultChecked) {
    return (
      <AppShell sidebarOpen={sidebarOpen} sidebarTab={sidebarTab} onToggleSidebar={handleToggleSidebar} onOpenFiles={handleOpenFiles} onOpenSearch={handleOpenSearch}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            DevScribe
          </span>
        </div>
      </AppShell>
    );
  }

  if (!vaultPath) {
    return (
      <AppShell sidebarOpen={sidebarOpen} sidebarTab={sidebarTab} onToggleSidebar={handleToggleSidebar} onOpenFiles={handleOpenFiles} onOpenSearch={handleOpenSearch}>
        <VaultScreen recentPath={recentVaultPath} onVaultReady={handleVaultReady} />
      </AppShell>
    );
  }

  if (!ready) {
    return (
      <AppShell sidebarOpen={sidebarOpen} sidebarTab={sidebarTab} onToggleSidebar={handleToggleSidebar} onOpenFiles={handleOpenFiles} onOpenSearch={handleOpenSearch}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            DevScribe
          </span>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell sidebarOpen={sidebarOpen} sidebarTab={sidebarTab} onToggleSidebar={handleToggleSidebar} onOpenFiles={handleOpenFiles} onOpenSearch={handleOpenSearch}>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <SessionSidebar
          open={sidebarOpen}
          tab={sidebarTab}
          vaultPath={vaultPath}
          onOpenFile={(path, content, name) => { setActiveFile(null); setTimeout(() => handleOpenFile(path, content, name), 0); }}
          onOpenJsonFormatter={() => setJsonDialogOpen(true)}
          onOpenTaskLists={() => setTaskListsDialogOpen(true)}
          onOpenSettings={() => setSettingsDialogOpen(true)}
          onOpenAgentConfig={() => setAgentConfigOpen(true)}
        />

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {activeFile ? (
            <FileEditorPane
              file={activeFile}
              cursorStyle={cursorStyle}
              cursorBlink={cursorBlink}
              onOpenJsonFormatter={() => setJsonDialogOpen(true)}
            />
          ) : currentSession ? (
            <EditorPane
              session={currentSession}
              onSessionChange={handleSessionChange}
              cursorStyle={cursorStyle}
              cursorBlink={cursorBlink}
              onOpenJsonFormatter={() => setJsonDialogOpen(true)}
            />
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)' }}>
              Abra um arquivo pelo explorador
            </div>
          )}
        </main>
      </div>

      <StatusBar session={activeFile ? null : currentSession} />

      {jsonDialogOpen && <JsonFormatterDialog onClose={() => setJsonDialogOpen(false)} />}

      {taskListsDialogOpen && (
        <TaskListsDialog onClose={() => setTaskListsDialogOpen(false)} vaultPath={vaultPath ?? undefined} />
      )}

      {settingsDialogOpen && (
        <SettingsDialog
          cursorStyle={cursorStyle}
          cursorBlink={cursorBlink}
          onCursorStyleChange={setCursorStyle}
          onCursorBlinkChange={setCursorBlink}
          onClose={() => setSettingsDialogOpen(false)}
        />
      )}

      {agentConfigOpen && vaultPath && (
        <AgentConfigDialog
          vaultPath={vaultPath}
          onClose={() => setAgentConfigOpen(false)}
        />
      )}
    </AppShell>
  );
}

function AppShell({
  children,
  sidebarOpen,
  sidebarTab,
  onToggleSidebar,
  onOpenFiles,
  onOpenSearch,
}: {
  children: React.ReactNode;
  sidebarOpen: boolean;
  sidebarTab: SidebarTab;
  onToggleSidebar: () => void;
  onOpenFiles: () => void;
  onOpenSearch: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)', overflow: 'hidden' }}>
      <TitleBar
        sidebarOpen={sidebarOpen}
        sidebarTab={sidebarTab}
        onToggleSidebar={onToggleSidebar}
        onOpenFiles={onOpenFiles}
        onOpenSearch={onOpenSearch}
      />
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}

function EditorPane({
  session, onSessionChange, cursorStyle, cursorBlink, onOpenJsonFormatter,
}: {
  session: Session;
  onSessionChange: (s: Session) => void;
  cursorStyle: CursorStyle;
  cursorBlink: CursorBlink;
  onOpenJsonFormatter: () => void;
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
      onOpenJsonFormatter={onOpenJsonFormatter}
    />
  );
}

function FileEditorPane({
  file, cursorStyle, cursorBlink, onOpenJsonFormatter,
}: {
  file: ActiveFile;
  cursorStyle: CursorStyle;
  cursorBlink: CursorBlink;
  onOpenJsonFormatter: () => void;
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
      onOpenJsonFormatter={onOpenJsonFormatter}
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
