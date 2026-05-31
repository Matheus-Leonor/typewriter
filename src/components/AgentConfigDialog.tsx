import { useEffect, useState, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { db } from '../db/index';
import type { InjectionHistoryEntry } from '../db/index';

interface Props {
  onClose: () => void;
  vaultPath: string;
}

const BUILTIN_TYPES = [
  { id: 'mvp',      name: 'MVP / Do zero',      icon: 'rocket_launch', file: 'mvp-do-zero.md' },
  { id: 'existing', name: 'Projeto existente',   icon: 'folder_open',   file: 'projeto-existente.md' },
  { id: 'bugfix',   name: 'Bug fix',             icon: 'bug_report',    file: 'bug-fix.md' },
  { id: 'arch',     name: 'Arquitetura',         icon: 'account_tree',  file: 'arquitetura.md' },
  { id: 'review',   name: 'Code review',         icon: 'rate_review',   file: 'code-review.md' },
] as const;

const BUILTIN_FILES: Set<string> = new Set(BUILTIN_TYPES.map((t) => t.file));

interface FsEntry { name: string; path: string; is_dir: boolean; }
interface CustomTemplate { id: string; name: string; }
interface VaultFile { name: string; path: string; displayName: string; }

function joinPath(base: string, ...parts: string[]): string {
  const sep = base.includes('\\') ? '\\' : '/';
  return [base, ...parts].join(sep);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function getTemplateFile(selected: string): string {
  const builtin = BUILTIN_TYPES.find((t) => t.id === selected);
  return builtin ? builtin.file : selected;
}

function getTemplateSlug(selected: string): string {
  return getTemplateFile(selected).replace(/\.md$/, '');
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith('---\n')) return content;
  const end = content.indexOf('\n---\n', 4);
  if (end === -1) return content;
  return content.slice(end + 5).trimStart();
}

function localTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AgentConfigDialog({ onClose, vaultPath }: Props) {
  // Step 1
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [customs, setCustoms] = useState<CustomTemplate[]>([]);
  const [newName, setNewName] = useState('');
  const [newContent, setNewContent] = useState('');
  const [saving, setSaving] = useState(false);

  // Step 2
  const [loadingStep2, setLoadingStep2] = useState(false);
  const [skills, setSkills] = useState<VaultFile[]>([]);
  const [docs, setDocs] = useState<VaultFile[]>([]);
  const [checkedSkills, setCheckedSkills] = useState<Set<string>>(new Set());
  const [checkedDocs, setCheckedDocs] = useState<Set<string>>(new Set());
  const [templateContent, setTemplateContent] = useState('');
  const [fileContents, setFileContents] = useState<Map<string, string>>(new Map());

  // Step 3
  const [targetPath, setTargetPath] = useState('');
  const [filename, setFilename] = useState<'CLAUDE.md' | 'AGENTS.md' | 'custom'>('CLAUDE.md');
  const [customFilename, setCustomFilename] = useState('');
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [showPathDropdown, setShowPathDropdown] = useState(false);
  const [injecting, setInjecting] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 4000);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const loadCustoms = useCallback(async () => {
    try {
      const dir = joinPath(vaultPath, 'agents', 'templates');
      const entries = await invoke<FsEntry[]>('list_dir', { path: dir });
      setCustoms(
        entries
          .filter((e) => !e.is_dir && !BUILTIN_FILES.has(e.name))
          .map((e) => ({
            id: e.name,
            name: e.name.replace(/\.md$/, '').replace(/-/g, ' '),
          })),
      );
    } catch (err) {
      console.error(err);
    }
  }, [vaultPath]);

  useEffect(() => { loadCustoms(); }, [loadCustoms]);

  const handleSave = useCallback(async () => {
    const slug = slugify(newName);
    if (!slug || !newContent.trim()) return;
    setSaving(true);
    try {
      const path = joinPath(vaultPath, 'agents', 'templates', `${slug}.md`);
      await invoke('write_file', {
        path,
        content: `---\ntipo: template\ncontexto: ${slug}\n---\n\n${newContent}`,
      });
      await loadCustoms();
      setSelected(`${slug}.md`);
      setNewName('');
      setNewContent('');
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [newName, newContent, vaultPath, loadCustoms]);

  const goToStep2 = useCallback(async () => {
    if (!selected || selected === '__create_new__') return;
    setLoadingStep2(true);
    try {
      const [skillEntries, docEntries] = await Promise.all([
        invoke<FsEntry[]>('list_vault_directory', { vaultPath, subdir: 'skills' }),
        invoke<FsEntry[]>('list_vault_directory', { vaultPath, subdir: 'docs' }),
      ]);

      const toVaultFile = (e: FsEntry): VaultFile => ({
        name: e.name,
        path: e.path,
        displayName: e.name.replace(/\.md$/, '').replace(/-/g, ' '),
      });

      const skillFiles = skillEntries.filter((e) => !e.is_dir).map(toVaultFile);
      const docFiles = docEntries.filter((e) => !e.is_dir).map(toVaultFile);

      const templatePath = joinPath(vaultPath, 'agents', 'templates', getTemplateFile(selected));
      const tmplContent = await invoke<string>('read_vault_file', { path: templatePath });

      const contents = new Map<string, string>();
      await Promise.all(
        [...skillFiles, ...docFiles].map(async (f) => {
          const c = await invoke<string>('read_vault_file', { path: f.path });
          contents.set(f.path, c);
        }),
      );

      setSkills(skillFiles);
      setDocs(docFiles);
      setTemplateContent(tmplContent);
      setFileContents(contents);
      setCheckedSkills(new Set());
      setCheckedDocs(new Set());
      setStep(2);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStep2(false);
    }
  }, [selected, vaultPath]);

  const goBack = useCallback(() => {
    setStep(1);
    setCheckedSkills(new Set());
    setCheckedDocs(new Set());
  }, []);

  const preview = useMemo(() => {
    if (step < 2 || !selected) return '';

    const skillNames = [...checkedSkills]
      .map((p) => p.split(/[/\\]/).pop()?.replace(/\.md$/, '') ?? '')
      .filter(Boolean);

    const header = [
      `<!-- gerado pelo TypeWriter em ${localTimestamp()} -->`,
      `<!-- template: ${getTemplateSlug(selected)} | skills: ${skillNames.join(', ')} -->`,
      '',
    ].join('\n');

    const parts = [header, stripFrontmatter(templateContent)];

    for (const path of checkedSkills) {
      const c = fileContents.get(path);
      if (c) parts.push('\n---\n', stripFrontmatter(c));
    }
    for (const path of checkedDocs) {
      const c = fileContents.get(path);
      if (c) parts.push('\n---\n', stripFrontmatter(c));
    }

    return parts.join('\n');
  }, [step, selected, checkedSkills, checkedDocs, templateContent, fileContents]);

  const toggleSkill = useCallback((path: string) => {
    setCheckedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  const toggleDoc = useCallback((path: string) => {
    setCheckedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  const goToStep3 = useCallback(async () => {
    try {
      const recents = await db.injections.getRecentPaths(5);
      setRecentPaths(recents);
    } catch { /* non-blocking */ }
    setStep(3);
  }, []);

  const handlePickFolder = useCallback(async () => {
    try {
      const folder = await invoke<string | null>('pick_folder');
      if (folder) setTargetPath(folder);
    } catch { /* ignore */ }
  }, []);

  const handleInject = useCallback(async () => {
    const actualFilename = filename === 'custom' ? customFilename.trim() : filename;
    if (!actualFilename || !targetPath) return;
    setInjecting(true);
    try {
      await invoke('inject_agent_file', { targetPath, content: preview, filename: actualFilename });
      const toNames = (paths: Set<string>) =>
        [...paths].map((p) => p.split(/[/\\]/).pop()?.replace(/\.md$/, '') ?? '').filter(Boolean);
      const entry: InjectionHistoryEntry = {
        id: crypto.randomUUID(),
        template_name: getTemplateSlug(selected!),
        skills: JSON.stringify(toNames(checkedSkills)),
        docs: JSON.stringify(toNames(checkedDocs)),
        target_path: targetPath,
        filename: actualFilename,
      };
      await db.injections.saveHistory(entry);
      setRecentPaths((prev) => [targetPath, ...prev.filter((p) => p !== targetPath)].slice(0, 5));
      setToastMsg(`${actualFilename} injetado com sucesso`);
    } catch (err) {
      console.error(err);
      setToastMsg('Erro ao injetar — veja o console');
    } finally {
      setInjecting(false);
    }
  }, [filename, customFilename, targetPath, preview, checkedSkills, checkedDocs, selected]);

  const isCreateNew = selected === '__create_new__';
  const canProceed = selected !== null && selected !== '__create_new__';
  const canSave = slugify(newName).length > 0 && newContent.trim().length > 0;
  const actualInjectFilename = filename === 'custom' ? customFilename.trim() : filename;
  const canInject = !!targetPath && !!actualInjectFilename;

  const stepHint =
    step === 1 ? 'Passo 1 — Escolha o contexto'
    : step === 2 ? 'Passo 2 — Skills & Docs'
    : 'Passo 3 — Injetar';

  return (
    <>
      <div onClick={onClose} style={backdropStyle} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Agent Configuration Manager"
        onClick={(e) => e.stopPropagation()}
        style={{
          ...dialogStyle,
          width: step === 2 ? 960 : 720,
          maxHeight: step === 2 ? 640 : step === 3 ? 480 : 560,
        }}
      >
        {/* Header */}
        <div style={headerStyle}>
          <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--text-muted)' }}>
            smart_toy
          </span>
          <span style={titleStyle}>Agent Configuration Manager</span>
          <span style={stepHintStyle}>{stepHint}</span>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Fechar">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
          </button>
        </div>

        {/* Step 1 body */}
        {step === 1 && (
          <div style={bodyStyle}>
            <div style={sectionLabelStyle}>Tipo de contexto</div>

            <div style={gridStyle}>
              {BUILTIN_TYPES.map((type) => (
                <ContextCard
                  key={type.id}
                  icon={type.icon}
                  name={type.name}
                  active={selected === type.id}
                  onClick={() => setSelected(type.id)}
                />
              ))}

              {customs.map((t) => (
                <ContextCard
                  key={t.id}
                  icon="description"
                  name={t.name}
                  active={selected === t.id}
                  onClick={() => setSelected(t.id)}
                />
              ))}

              <button
                onClick={() => setSelected('__create_new__')}
                style={{
                  ...cardBase,
                  background: isCreateNew ? 'var(--bg-overlay)' : 'transparent',
                  border: isCreateNew
                    ? '1.5px solid var(--text-primary)'
                    : '0.5px dashed var(--border)',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>
                  add_circle
                </span>
                <span style={{ ...cardNameStyle, color: 'var(--text-muted)' }}>Criar novo tipo</span>
              </button>
            </div>

            {isCreateNew && (
              <div style={formPanelStyle}>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nome do template (ex: minha-feature)"
                  autoFocus
                  style={inputStyle}
                />
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Conteúdo do template em Markdown…"
                  rows={6}
                  style={textareaStyle}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleSave}
                    disabled={saving || !canSave}
                    style={{ ...actionBtnStyle, opacity: canSave ? 1 : 0.35, cursor: canSave ? 'pointer' : 'default' }}
                  >
                    {saving ? 'Salvando…' : 'Salvar template'}
                  </button>
                  <button
                    onClick={() => { setSelected(null); setNewName(''); setNewContent(''); }}
                    style={ghostBtnStyle}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2 body */}
        {step === 2 && (
          <div style={step2BodyStyle}>
            {/* Left panel — checklist */}
            <div style={leftPanelStyle}>
              <ChecklistSection
                title="Skills"
                files={skills}
                checked={checkedSkills}
                onToggle={toggleSkill}
              />
              <ChecklistSection
                title="Docs"
                files={docs}
                checked={checkedDocs}
                onToggle={toggleDoc}
              />
            </div>

            {/* Divider */}
            <div style={panelDividerStyle} />

            {/* Right panel — preview */}
            <div style={rightPanelStyle}>
              <div style={previewLabelStyle}>Preview</div>
              <PreviewContent content={preview} />
            </div>
          </div>
        )}

        {/* Step 3 body */}
        {step === 3 && (
          <div style={bodyStyle}>
            <div style={sectionLabelStyle}>Diretório de destino</div>

            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={targetPath}
                  onChange={(e) => setTargetPath(e.target.value)}
                  onFocus={() => recentPaths.length > 0 && setShowPathDropdown(true)}
                  onBlur={() => setTimeout(() => setShowPathDropdown(false), 150)}
                  placeholder="Caminho do diretório (ex: C:\projetos\meu-app)"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button onClick={handlePickFolder} style={folderBtnStyle} title="Selecionar pasta">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>folder_open</span>
                </button>
              </div>
              {showPathDropdown && (
                <div style={dropdownStyle}>
                  {recentPaths.map((p) => (
                    <button
                      key={p}
                      onMouseDown={() => { setTargetPath(p); setShowPathDropdown(false); }}
                      style={dropdownItemStyle}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={sectionLabelStyle}>Nome do arquivo</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['CLAUDE.md', 'AGENTS.md', 'custom'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setFilename(opt)}
                  style={{
                    ...filenameBtnBase,
                    background: filename === opt ? 'var(--bg-overlay)' : 'var(--bg-surface)',
                    border: filename === opt ? '1.5px solid var(--text-primary)' : '0.5px solid var(--border)',
                    fontWeight: filename === opt ? 500 : 400,
                  }}
                >
                  {opt === 'custom' ? 'Custom…' : opt}
                </button>
              ))}
            </div>

            {filename === 'custom' && (
              <input
                value={customFilename}
                onChange={(e) => setCustomFilename(e.target.value)}
                placeholder="nome-do-arquivo.md"
                style={inputStyle}
                autoFocus
              />
            )}

            {toastMsg && (
              <div style={toastStyle}>
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--accent)' }}>
                  check_circle
                </span>
                {toastMsg}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={footerStyle}>
          {step === 1 && (
            <button
              onClick={goToStep2}
              disabled={!canProceed || loadingStep2}
              style={{
                ...actionBtnStyle,
                marginLeft: 'auto',
                opacity: canProceed ? 1 : 0.35,
                cursor: canProceed ? 'pointer' : 'default',
              }}
            >
              {loadingStep2 ? 'Carregando…' : 'Próximo →'}
            </button>
          )}
          {step === 2 && (
            <>
              <button onClick={goBack} style={ghostBtnStyle}>← Voltar</button>
              <button
                onClick={goToStep3}
                style={{ ...actionBtnStyle, marginLeft: 'auto' }}
              >
                Próximo →
              </button>
            </>
          )}
          {step === 3 && (
            <>
              <button onClick={() => setStep(2)} style={ghostBtnStyle}>← Voltar</button>
              <button
                onClick={handleInject}
                disabled={!canInject || injecting}
                style={{
                  ...actionBtnStyle,
                  marginLeft: 'auto',
                  opacity: canInject ? 1 : 0.35,
                  cursor: canInject ? 'pointer' : 'default',
                }}
              >
                {injecting ? 'Injetando…' : 'Injetar'}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function ContextCard({
  icon, name, active, onClick,
}: {
  icon: string;
  name: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...cardBase,
        background: active ? 'var(--bg-overlay)' : 'var(--bg-surface)',
        border: active ? '1.5px solid var(--text-primary)' : '0.5px solid var(--border)',
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: 20, color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}
      >
        {icon}
      </span>
      <span style={{ ...cardNameStyle, fontWeight: active ? 500 : 400 }}>{name}</span>
    </button>
  );
}

function ChecklistSection({
  title, files, checked, onToggle,
}: {
  title: string;
  files: VaultFile[];
  checked: Set<string>;
  onToggle: (path: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={sectionLabelStyle}>{title}</div>
      {files.length === 0 && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', padding: '2px 0 8px' }}>
          Nenhum arquivo encontrado
        </span>
      )}
      {files.map((f) => (
        <label key={f.path} style={checkItemStyle}>
          <input
            type="checkbox"
            checked={checked.has(f.path)}
            onChange={() => onToggle(f.path)}
            style={{ accentColor: 'var(--accent)', margin: 0, flexShrink: 0 }}
          />
          <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', lineHeight: 1.3 }}>
            {f.displayName}
          </span>
        </label>
      ))}
    </div>
  );
}

function PreviewContent({ content }: { content: string }) {
  const lines = content.split('\n');

  return (
    <div style={previewScrollStyle}>
      <pre style={preStyle}>
        {lines.map((line, i) => (
          <span key={i} style={lineStyle(line)}>
            {line}
            {'\n'}
          </span>
        ))}
      </pre>
    </div>
  );
}

function lineStyle(line: string): React.CSSProperties {
  if (line.startsWith('# '))  return { fontWeight: 700, opacity: 1 };
  if (line.startsWith('## ')) return { fontWeight: 600, opacity: 0.9 };
  if (line.startsWith('### ')) return { fontWeight: 500, opacity: 0.85 };
  if (line.startsWith('<!--') && line.endsWith('-->')) return { opacity: 0.4 };
  if (line === '---') return { opacity: 0.3 };
  return { opacity: 0.75 };
}

// ── Styles ────────────────────────────────────────────────────────────────────

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  zIndex: 1000,
};

const dialogStyle: React.CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  background: 'var(--bg-primary)',
  border: '0.5px solid var(--border)',
  borderRadius: 8,
  display: 'flex',
  flexDirection: 'column',
  zIndex: 1001,
  overflow: 'hidden',
  boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
};

const headerStyle: React.CSSProperties = {
  padding: '10px 16px',
  borderBottom: '0.5px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
};

const titleStyle: React.CSSProperties = {
  flex: 1,
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
  fontWeight: 500,
};

const stepHintStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  opacity: 0.55,
};

const closeBtnStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: '50%',
  border: '0.5px solid var(--border)',
  background: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  flexShrink: 0,
  marginLeft: 4,
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '20px 24px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const step2BodyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'row',
  overflow: 'hidden',
};

const leftPanelStyle: React.CSSProperties = {
  width: 220,
  flexShrink: 0,
  overflowY: 'auto',
  padding: '16px 16px 16px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
};

const panelDividerStyle: React.CSSProperties = {
  width: '0.5px',
  background: 'var(--border)',
  flexShrink: 0,
};

const rightPanelStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  padding: '16px 0 0',
};

const previewLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  paddingLeft: 20,
  paddingBottom: 10,
  flexShrink: 0,
};

const previewScrollStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  paddingLeft: 20,
  paddingRight: 16,
  paddingBottom: 16,
};

const preStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  lineHeight: 1.6,
  color: 'var(--text-primary)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const footerStyle: React.CSSProperties = {
  padding: '10px 20px',
  borderTop: '0.5px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
};

const sectionLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const checkItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  cursor: 'pointer',
  padding: '3px 0',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 10,
};

const cardBase: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 8,
  padding: '16px 16px 14px',
  borderRadius: 6,
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'border-color 100ms ease, background 100ms ease',
};

const cardNameStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
};

const formPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 16,
  background: 'var(--bg-surface)',
  border: '0.5px solid var(--border)',
  borderRadius: 6,
};

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-overlay)',
  border: '0.5px solid var(--border)',
  borderRadius: 4,
  padding: '7px 12px',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-sm)',
  outline: 'none',
  width: '100%',
};

const textareaStyle: React.CSSProperties = {
  background: 'var(--bg-overlay)',
  border: '0.5px solid var(--border)',
  borderRadius: 4,
  padding: '7px 12px',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
  outline: 'none',
  resize: 'vertical',
  width: '100%',
};

const actionBtnStyle: React.CSSProperties = {
  background: 'var(--accent-muted)',
  border: '0.5px solid var(--border)',
  borderRadius: 3,
  padding: '4px 14px',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  cursor: 'pointer',
};

const ghostBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  padding: '4px 8px',
  borderRadius: 3,
};

const folderBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 10px',
  background: 'var(--bg-surface)',
  border: '0.5px solid var(--border)',
  borderRadius: 4,
  cursor: 'pointer',
  color: 'var(--text-muted)',
  flexShrink: 0,
};

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  marginTop: 2,
  background: 'var(--bg-surface)',
  border: '0.5px solid var(--border)',
  borderRadius: 4,
  zIndex: 10,
  overflow: 'hidden',
  boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
};

const dropdownItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '7px 12px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const filenameBtnBase: React.CSSProperties = {
  padding: '5px 14px',
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-primary)',
  transition: 'border-color 100ms ease, background 100ms ease',
};

const toastStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  background: 'var(--bg-overlay)',
  border: '0.5px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
};
