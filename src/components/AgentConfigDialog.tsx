import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { db } from '../db/index';
import type { InjectionHistoryEntry, ComposeDefaultRecord } from '../db/index';
import {
  addComposeSection,
  addComposeSectionFromDefault,
  buildComposeInjectionPlan,
  COMPOSE_ARTIFACTS,
  composeDefaultId,
  composeSectionDefaultFromRecord,
  createBlankComposeSection,
  createComposeState,
  removeComposeSection,
  syncComposeAgentReferences,
  syncComposeDirectories,
  toComposeSectionDefault,
  updateComposeSectionContent,
  updateComposeSectionSettings,
} from '../compose/composeModel';
import type {
  ComposeInjectionPlanItem,
  ComposeInjectionMode,
  ComposeSection,
  ComposeSectionType,
  ComposeState,
} from '../compose/composeModel';

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


function buildAgentContent(params: {
  selected: string;
  selectedArtifacts: Set<ComposeSectionType>;
  templateContent: string;
}): string {
  const artifactNames = COMPOSE_ARTIFACTS
    .filter((option) => params.selectedArtifacts.has(option.id))
    .map((option) => option.name);

  const header = [
    `<!-- gerado pelo TypeWriter em ${localTimestamp()} -->`,
    `<!-- template: ${getTemplateSlug(params.selected)} | artefatos: ${artifactNames.join(', ')} -->`,
    '',
  ].join('\n');

  return [header, stripFrontmatter(params.templateContent)].join('\n');
}

export function AgentConfigDialog({ onClose, vaultPath }: Props) {
  // Step 1
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [customs, setCustoms] = useState<CustomTemplate[]>([]);
  const [newName, setNewName] = useState('');
  const [newContent, setNewContent] = useState('');
  const [saving, setSaving] = useState(false);

  // Step 2
  const [selectedArtifacts, setSelectedArtifacts] = useState<Set<ComposeSectionType>>(new Set());

  // Step 3
  const [loadingStep2, setLoadingStep2] = useState(false);
  const [templateContent, setTemplateContent] = useState('');
  const [compose, setCompose] = useState<ComposeState | null>(null);
  const [selectedComposeSectionId, setSelectedComposeSectionId] = useState<string | null>(null);
  const [savedDefaults, setSavedDefaults] = useState<ComposeDefaultRecord[]>([]);
  const [savingDefaultId, setSavingDefaultId] = useState<string | null>(null);
  const [defaultsError, setDefaultsError] = useState<string | null>(null);
  const lastGeneratedAgentContentRef = useRef('');

  // Step 4
  const [targetPath, setTargetPath] = useState('');
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

  const loadComposeDefaults = useCallback(async () => {
    try {
      setSavedDefaults(await db.composeDefaults.list());
    } catch (err) {
      console.error(err);
    }
  }, []);

  const goToStep2 = useCallback(() => {
    if (!selected || selected === '__create_new__') return;
    setSelectedArtifacts(new Set());
    setCompose(null);
    setSelectedComposeSectionId(null);
    setStep(2);
  }, [selected]);

  const goToStep3 = useCallback(async () => {
    if (selectedArtifacts.size === 0 || !selected || selected === '__create_new__') return;
    setLoadingStep2(true);
    try {
      await loadComposeDefaults();
      const templatePath = joinPath(vaultPath, 'agents', 'templates', getTemplateFile(selected));
      const tmplContent = await invoke<string>('read_vault_file', { path: templatePath });
      setTemplateContent(tmplContent);
      const initialAgentContent = buildAgentContent({
        selected,
        selectedArtifacts,
        templateContent: tmplContent,
      });
      lastGeneratedAgentContentRef.current = initialAgentContent;
      const nextCompose = createComposeState({
        templateId: selected,
        templateSlug: getTemplateSlug(selected),
        selectedTypes: selectedArtifacts,
        targetDirectory: targetPath,
        agentContent: initialAgentContent,
      });
      setCompose(nextCompose);
      setSelectedComposeSectionId(nextCompose.primarySectionId || nextCompose.sections[0]?.id || null);
      setStep(3);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStep2(false);
    }
  }, [loadComposeDefaults, selected, selectedArtifacts, targetPath, vaultPath]);

  const goBack = useCallback(() => {
    setStep(1);
    setSelectedArtifacts(new Set());
    setCompose(null);
    setSelectedComposeSectionId(null);
  }, []);

  const agentContent = useMemo(() => {
    if (step < 3 || !selected) return '';
    return buildAgentContent({ selected, selectedArtifacts, templateContent });
  }, [step, selected, selectedArtifacts, templateContent]);

  useEffect(() => {
    if (step < 3 || !selected) return;
    setCompose((current) => {
      if (!current) return current;
      const previousGenerated = lastGeneratedAgentContentRef.current;
      lastGeneratedAgentContentRef.current = agentContent;
      return syncComposeAgentReferences({
        ...current,
        sections: current.sections.map((section) => ({
          ...section,
          content:
            section.tipo === 'agent' &&
            (section.content === previousGenerated || section.content.trim() === '')
              ? agentContent
              : section.content,
        })),
        updatedAt: Date.now(),
      });
    });
  }, [agentContent, step, selected]);

  useEffect(() => {
    setCompose((current) => syncComposeDirectories(current, targetPath));
  }, [targetPath]);

  const selectedComposeSection = useMemo(() => {
    if (!compose) return null;
    return (
      compose.sections.find((section) => section.id === selectedComposeSectionId) ??
      compose.sections.find((section) => section.id === compose.primarySectionId) ??
      compose.sections[0] ??
      null
    );
  }, [compose, selectedComposeSectionId]);

  useEffect(() => {
    if (!compose) {
      setSelectedComposeSectionId(null);
      return;
    }

    if (!selectedComposeSectionId || !compose.sections.some((section) => section.id === selectedComposeSectionId)) {
      setSelectedComposeSectionId(compose.primarySectionId || compose.sections[0]?.id || null);
    }
  }, [compose, selectedComposeSectionId]);

  const handleComposeSectionChange = useCallback((sectionId: string, content: string) => {
    setCompose((current) => updateComposeSectionContent(current, sectionId, content));
  }, []);

  const handleComposeSectionSettingsChange = useCallback((
    sectionId: string,
    patch: Partial<Pick<
      ComposeSection,
      'tipo' | 'titulo' | 'filename' | 'directory' | 'isPinned' | 'category' | 'includeInAgent' | 'injectionMode'
    >>,
  ) => {
    setCompose((current) => updateComposeSectionSettings(current, sectionId, patch));
  }, []);

  const handleSaveDefault = useCallback(async (section: ComposeSection) => {
    const def = toComposeSectionDefault(section);
    setSavingDefaultId(section.id);
    setDefaultsError(null);
    try {
      await db.composeDefaults.save({
        id: composeDefaultId(section),
        titulo: def.titulo,
        content: def.content,
        category: def.category,
        tipo: def.tipo,
        metadata: JSON.stringify({
          filename: def.filename,
          includeInAgent: def.includeInAgent,
          injectionMode: def.injectionMode,
        }),
      });
      await loadComposeDefaults();
    } catch (err) {
      console.error(err);
      setDefaultsError('Erro ao fixar — veja o console');
    } finally {
      setSavingDefaultId(null);
    }
  }, [loadComposeDefaults]);

  const handleAddDefault = useCallback((record: ComposeDefaultRecord) => {
    const def = composeSectionDefaultFromRecord(record);
    setCompose((current) => {
      const next = addComposeSectionFromDefault(current, def, targetPath);
      const added = next?.sections[next.sections.length - 1];
      if (added) setSelectedComposeSectionId(added.id);
      return next;
    });
  }, [targetPath]);

  const handleNewFile = useCallback(() => {
    setCompose((current) => {
      if (!current) return current;
      const section = createBlankComposeSection(targetPath);
      const next = addComposeSection(current, section);
      setSelectedComposeSectionId(section.id);
      return next;
    });
  }, [targetPath]);

  const handleDeleteSection = useCallback((sectionId: string) => {
    setCompose((current) => {
      const next = removeComposeSection(current, sectionId);
      if (next && next !== current) {
        setSelectedComposeSectionId((prev) =>
          prev === sectionId ? next.primarySectionId || next.sections[0]?.id || null : prev,
        );
      }
      return next;
    });
  }, []);

  const handleDeleteDefault = useCallback(async (id: string) => {
    setDefaultsError(null);
    try {
      await db.composeDefaults.delete(id);
      setSavedDefaults((current) => current.filter((record) => record.id !== id));
    } catch (err) {
      console.error(err);
      setDefaultsError('Erro ao remover fixado — veja o console');
    }
  }, []);

  const toggleArtifact = useCallback((artifact: ComposeSectionType) => {
    setSelectedArtifacts((prev) => {
      const next = new Set(prev);
      if (next.has(artifact)) next.delete(artifact); else next.add(artifact);
      return next;
    });
  }, []);

  const goToStep4 = useCallback(async () => {
    try {
      const recents = await db.injections.getRecentPaths(5);
      setRecentPaths(recents);
    } catch { /* non-blocking */ }
    setStep(4);
  }, []);

  const handlePickFolder = useCallback(async () => {
    try {
      const folder = await invoke<string | null>('pick_folder');
      if (folder) setTargetPath(folder);
    } catch { /* ignore */ }
  }, []);

  const handleInject = useCallback(async () => {
    const plan = buildComposeInjectionPlan(compose);
    if (plan.length === 0 || plan.some((item) => item.errors.length > 0)) return;
    setInjecting(true);
    try {
      for (const item of plan) {
        await invoke('inject_agent_file', {
          targetPath: item.directory,
          content: item.content,
          filename: item.filename,
          mode: item.mode,
        });
      }
      const entry: InjectionHistoryEntry = {
        id: crypto.randomUUID(),
        template_name: getTemplateSlug(selected!),
        skills: JSON.stringify([]),
        docs: JSON.stringify([]),
        target_path: plan.find((item) => item.isPrimary)?.directory ?? plan[0].directory,
        filename: plan.find((item) => item.isPrimary)?.filename ?? plan[0].filename,
      };
      await db.injections.saveHistory(entry);
      const injectedDirectories = [...new Set(plan.map((item) => item.directory))];
      setRecentPaths((prev) => [...injectedDirectories, ...prev.filter((p) => !injectedDirectories.includes(p))].slice(0, 5));
      setToastMsg(`${plan.length} arquivo${plan.length === 1 ? '' : 's'} injetado${plan.length === 1 ? '' : 's'} com sucesso`);
    } catch (err) {
      console.error(err);
      setToastMsg('Erro ao injetar — veja o console');
    } finally {
      setInjecting(false);
    }
  }, [compose, selected]);

  const isCreateNew = selected === '__create_new__';
  const canProceed = selected !== null && selected !== '__create_new__';
  const canProceedArtifacts = selectedArtifacts.size > 0;
  const canSave = slugify(newName).length > 0 && newContent.trim().length > 0;
  const injectionPlan = useMemo(() => buildComposeInjectionPlan(compose), [compose]);
  const injectionErrors = injectionPlan.flatMap((item) => item.errors.map((error) => `${item.title}: ${error}`));
  const canInject = injectionPlan.length > 0 && injectionErrors.length === 0;

  const stepHint =
    step === 1 ? 'Passo 1: Contexto'
    : step === 2 ? 'Passo 2: Artefatos'
    : step === 3 ? 'Passo 3: Compose'
    : 'Passo 4: Injetar';

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
          width: step === 3 ? 1120 : 720,
          maxHeight: step === 3 ? 640 : step === 4 ? 480 : 560,
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
            <div style={sectionLabelStyle}>Contexto</div>

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
                <span style={{ ...cardNameStyle, color: 'var(--text-muted)' }}>Novo contexto</span>
              </button>
            </div>

            {isCreateNew && (
              <div style={formPanelStyle}>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nome do contexto"
                  autoFocus
                  style={inputStyle}
                />
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Template em Markdown..."
                  rows={6}
                  style={textareaStyle}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleSave}
                    disabled={saving || !canSave}
                    style={{ ...actionBtnStyle, opacity: canSave ? 1 : 0.35, cursor: canSave ? 'pointer' : 'default' }}
                  >
                    {saving ? 'Salvando...' : 'Salvar'}
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
          <div style={bodyStyle}>
            <div>
              <div style={sectionLabelStyle}>Artefatos</div>
              <p style={helperTextStyle}>Selecione o que será criado.</p>
            </div>

            <div style={gridStyle}>
              {COMPOSE_ARTIFACTS.map((artifact) => (
                <ArtifactCard
                  key={artifact.id}
                  icon={artifact.icon}
                  name={artifact.name}
                  active={selectedArtifacts.has(artifact.id)}
                  onClick={() => toggleArtifact(artifact.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Step 3 body */}
        {step === 3 && (
          <div style={step2BodyStyle}>
            {/* Left panel — biblioteca de markdowns reutilizáveis */}
            <div style={leftPanelStyle}>
              {defaultsError && (
                <div style={defaultsErrorStyle}>{defaultsError}</div>
              )}
              <ComposeLibrary
                savedDefaults={savedDefaults}
                onInjectDefault={handleAddDefault}
                onDeleteDefault={handleDeleteDefault}
              />
            </div>

            {/* Divider */}
            <div style={panelDividerStyle} />

            {/* Center panel — tabbed single editor */}
            <div style={rightPanelStyle}>
              <ComposeTabs
                compose={compose}
                selectedSectionId={selectedComposeSection?.id ?? null}
                primarySectionId={compose?.primarySectionId ?? null}
                onSelectSection={setSelectedComposeSectionId}
                onDeleteSection={handleDeleteSection}
                onNewFile={handleNewFile}
              />
              <ComposeEditor
                section={selectedComposeSection}
                onChangeSection={handleComposeSectionChange}
              />
            </div>

            <div style={panelDividerStyle} />

            <div style={inspectorPanelStyle}>
              <ComposeInspector
                section={selectedComposeSection}
                onChange={handleComposeSectionSettingsChange}
                onSaveDefault={handleSaveDefault}
                savingDefault={savingDefaultId === selectedComposeSection?.id}
              />
            </div>
          </div>
        )}

        {/* Step 4 body */}
        {step === 4 && (
          <div style={bodyStyle}>
            <div style={sectionLabelStyle}>Destino</div>

            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={targetPath}
                  onChange={(e) => setTargetPath(e.target.value)}
                  onFocus={() => recentPaths.length > 0 && setShowPathDropdown(true)}
                  onBlur={() => setTimeout(() => setShowPathDropdown(false), 150)}
                  placeholder="Caminho do projeto"
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

            <InjectionReview plan={injectionPlan} errors={injectionErrors} />

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
              {loadingStep2 ? 'Carregando...' : 'Avançar'}
            </button>
          )}
          {step === 2 && (
            <>
              <button onClick={goBack} style={ghostBtnStyle}>Voltar</button>
              <button
                onClick={goToStep3}
                disabled={!canProceedArtifacts || loadingStep2}
                style={{
                  ...actionBtnStyle,
                  marginLeft: 'auto',
                  opacity: canProceedArtifacts ? 1 : 0.35,
                  cursor: canProceedArtifacts ? 'pointer' : 'default',
                }}
              >
                {loadingStep2 ? 'Carregando...' : 'Avançar'}
              </button>
            </>
          )}
          {step === 3 && (
            <>
              <button onClick={() => setStep(2)} style={ghostBtnStyle}>Voltar</button>
              <button
                onClick={goToStep4}
                style={{ ...actionBtnStyle, marginLeft: 'auto' }}
              >
                Avançar
              </button>
            </>
          )}
          {step === 4 && (
            <>
              <button onClick={() => setStep(3)} style={ghostBtnStyle}>Voltar</button>
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
                {injecting ? 'Injetando...' : 'Injetar'}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function ArtifactCard({
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
      aria-pressed={active}
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

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <label style={inspectorFieldStyle}>
      <span style={inspectorLabelStyle}>{label}</span>
      <div ref={wrapRef} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={customSelectTriggerStyle}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span>{selectedLabel}</span>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 14, lineHeight: 1, color: 'var(--text-muted)', flexShrink: 0 }}
          >
            {open ? 'expand_less' : 'expand_more'}
          </span>
        </button>
        {open && (
          <div style={customDropdownListStyle} role="listbox">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={opt.value === value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  ...customDropdownItemStyle,
                  background: opt.value === value ? 'var(--accent-muted)' : 'none',
                  color: opt.value === value ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </label>
  );
}

function ComposeLibrary({
  savedDefaults,
  onInjectDefault,
  onDeleteDefault,
}: {
  savedDefaults: ComposeDefaultRecord[];
  onInjectDefault: (record: ComposeDefaultRecord) => void;
  onDeleteDefault: (id: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <div style={sectionLabelStyle}>Biblioteca</div>
        <p style={libraryHintStyle}>
          Injete um predefinido como aba editável.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={librarySubLabelStyle}>Predefinidos</div>
        {savedDefaults.length === 0 ? (
          <span style={libraryEmptyStyle}>
            Salve uma aba como predefinido pelo painel direito.
          </span>
        ) : (
          savedDefaults.map((record) => (
            <div key={record.id} style={savedDefaultItemStyle}>
              <button
                onClick={() => onInjectDefault(record)}
                style={savedDefaultAddBtnStyle}
                title="Injetar como aba editável"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--text-muted)' }}>
                  download
                </span>
                <span style={libraryItemTextStyle}>
                  <span style={libraryItemNameStyle}>{record.titulo}</span>
                  <span style={libraryItemKindStyle}>{record.tipo}</span>
                </span>
              </button>
              <button
                onClick={() => onDeleteDefault(record.id)}
                style={savedDefaultDeleteBtnStyle}
                title="Excluir predefinido"
                aria-label={`Excluir predefinido ${record.titulo}`}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ComposeTabs({
  compose,
  selectedSectionId,
  primarySectionId,
  onSelectSection,
  onDeleteSection,
  onNewFile,
}: {
  compose: ComposeState | null;
  selectedSectionId: string | null;
  primarySectionId: string | null;
  onSelectSection: (sectionId: string) => void;
  onDeleteSection: (sectionId: string) => void;
  onNewFile: () => void;
}) {
  const sections = compose?.sections ?? [];
  const canDelete = sections.length > 1;

  return (
    <div style={composeTabBarStyle} role="tablist" aria-label="Seções do compose">
      {sections.map((section) => {
        const active = section.id === selectedSectionId;
        const isPrimary = section.id === primarySectionId;
        return (
          <div
            key={section.id}
            role="tab"
            aria-selected={active}
            onClick={() => onSelectSection(section.id)}
            style={{
              ...composeTabStyle,
              background: active ? 'var(--bg-overlay)' : 'transparent',
              borderColor: active ? 'var(--text-primary)' : 'var(--border)',
              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
            title={section.filename}
          >
            <span className="material-symbols-outlined" style={composeTabIconStyle}>
              {COMPOSE_ARTIFACTS.find((artifact) => artifact.id === section.tipo)?.icon ?? 'description'}
            </span>
            <span style={composeTabLabelStyle}>{section.titulo}{isPrimary ? ' ·' : ''}</span>
            {canDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteSection(section.id); }}
                style={composeTabCloseStyle}
                title="Excluir esta seção"
                aria-label={`Excluir seção ${section.titulo}`}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span>
              </button>
            )}
          </div>
        );
      })}
      <button
        onClick={onNewFile}
        style={composeTabNewStyle}
        title="Nova seção em branco"
        aria-label="New file"
        disabled={!compose}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
        <span style={composeTabNewLabelStyle}>New file</span>
      </button>
    </div>
  );
}

function ComposeEditor({
  section,
  onChangeSection,
}: {
  section: ComposeSection | null;
  onChangeSection: (sectionId: string, content: string) => void;
}) {
  if (!section) {
    return (
      <div style={composeEmptyStyle}>
        Nenhuma seção carregada.
      </div>
    );
  }

  return (
    <div style={composeEditorWrapStyle}>
      <span style={composeEditorMetaStyle}>{section.filename}</span>
      <textarea
        value={section.content}
        onChange={(e) => onChangeSection(section.id, e.target.value)}
        spellCheck={false}
        style={composeEditorTextareaStyle}
        aria-label={`Editar seção ${section.titulo}`}
      />
    </div>
  );
}

function ComposeInspector({
  section,
  onChange,
  onSaveDefault,
  savingDefault,
}: {
  section: ComposeSection | null;
  onChange: (
    sectionId: string,
    patch: Partial<Pick<
      ComposeSection,
      'tipo' | 'titulo' | 'filename' | 'directory' | 'isPinned' | 'category' | 'includeInAgent' | 'injectionMode'
    >>,
  ) => void;
  onSaveDefault: (section: ComposeSection) => void;
  savingDefault: boolean;
}) {
  if (!section) {
    return (
      <aside style={inspectorEmptyStyle}>
        Selecione uma seção para configurar.
      </aside>
    );
  }

  const updateType = (tipo: ComposeSectionType) => {
    const artifact = COMPOSE_ARTIFACTS.find((item) => item.id === tipo);
    onChange(section.id, {
      tipo,
      titulo: artifact?.name ?? section.titulo,
      filename: section.filename.trim() ? section.filename : artifact?.defaultFilename ?? section.filename,
    });
  };

  return (
    <aside style={inspectorStyle}>
      <div>
        <div style={inspectorTitleStyle}>Config</div>
        <div style={inspectorSubtitleStyle}>{section.titulo}</div>
      </div>

      <SelectField
        label="Tipo"
        value={section.tipo}
        options={COMPOSE_ARTIFACTS.map((artifact) => ({ value: artifact.id, label: artifact.name }))}
        onChange={(v) => updateType(v as ComposeSectionType)}
      />

      <InspectorField label="Arquivo">
        <input
          value={section.filename}
          onChange={(e) => onChange(section.id, { filename: e.target.value })}
          placeholder="arquivo.md"
          style={inspectorInputStyle}
        />
      </InspectorField>

      <InspectorField label="Diretório">
        <input
          value={section.directory}
          onChange={(e) => onChange(section.id, { directory: e.target.value })}
          placeholder="C:\\projeto"
          style={inspectorInputStyle}
        />
      </InspectorField>

      <SelectField
        label="Modo"
        value={section.injectionMode}
        options={[
          { value: 'create', label: 'Criar' },
          { value: 'overwrite', label: 'Sobrescrever' },
          { value: 'append', label: 'Anexar' },
        ]}
        onChange={(v) => onChange(section.id, { injectionMode: v as ComposeInjectionMode })}
      />

      <button
        onClick={() => onSaveDefault(section)}
        disabled={savingDefault}
        style={{ ...inspectorSaveDefaultBtnStyle, opacity: savingDefault ? 0.45 : 1 }}
        title="Salvar esta seção como fixado para reutilizar em composições futuras"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>push_pin</span>
        {savingDefault ? 'Fixando...' : 'Salvar como fixado'}
      </button>
    </aside>
  );
}

function InspectorField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={inspectorFieldStyle}>
      <span style={inspectorLabelStyle}>{label}</span>
      {children}
    </label>
  );
}

function InjectionReview({
  plan,
  errors,
}: {
  plan: ComposeInjectionPlanItem[];
  errors: string[];
}) {
  const agentReferences = plan.flatMap((item) => item.references);

  return (
    <div style={reviewWrapStyle}>
      <div style={reviewHeaderStyle}>
        <div>
          <div style={reviewTitleStyle}>Revisão</div>
          <div style={reviewSubtitleStyle}>
            {plan.length} arquivo{plan.length === 1 ? '' : 's'} pronto{plan.length === 1 ? '' : 's'} para injetar
          </div>
        </div>
        {errors.length > 0 && (
          <span style={reviewErrorBadgeStyle}>Bloqueado</span>
        )}
      </div>

      <div style={reviewListStyle}>
        {plan.map((item) => (
          <div key={item.sectionId} style={reviewItemStyle}>
            <div style={reviewItemHeaderStyle}>
              <div style={{ minWidth: 0 }}>
                <strong style={reviewItemTitleStyle}>{item.title}{item.isPrimary ? ' · principal' : ''}</strong>
                <span style={reviewPathStyle}>{item.fullPath || 'Destino incompleto'}</span>
              </div>
              <span style={reviewModeStyle}>{formatInjectionMode(item.mode)}</span>
            </div>
            <div style={reviewMetaGridStyle}>
              <ReviewMeta label="Arquivo" value={item.filename || 'Nao informado'} />
              <ReviewMeta label="Diretorio" value={item.directory || 'Nao informado'} />
            </div>
            {item.errors.length > 0 && (
              <div style={reviewInlineErrorStyle}>
                {item.errors.join(' · ')}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={reviewReferencesStyle}>
        <div style={sectionLabelStyle}>Referencias adicionadas no Agent</div>
        {agentReferences.length > 0 ? (
          <div style={referenceListStyle}>
            {[...new Set(agentReferences)].map((reference) => (
              <code key={reference} style={referencePillStyle}>{reference}</code>
            ))}
          </div>
        ) : (
          <span style={reviewEmptyStyle}>Nenhuma referencia markdown sera adicionada.</span>
        )}
      </div>

      {errors.length > 0 && (
        <div style={reviewBlockingStyle}>
          Corrija os campos no Passo 3 antes de injetar: {errors.join(' · ')}
        </div>
      )}
    </div>
  );
}

function ReviewMeta({ label, value }: { label: string; value: string }) {
  return (
    <div style={reviewMetaStyle}>
      <span style={reviewMetaLabelStyle}>{label}</span>
      <span style={reviewMetaValueStyle}>{value}</span>
    </div>
  );
}

function formatInjectionMode(mode: ComposeInjectionMode): string {
  if (mode === 'overwrite') return 'Sobrescrever';
  if (mode === 'append') return 'Anexar';
  return 'Criar';
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

const inspectorPanelStyle: React.CSSProperties = {
  width: 260,
  flexShrink: 0,
  overflowY: 'auto',
  padding: '16px 20px 16px 16px',
};

const inspectorStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const inspectorEmptyStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-sm)',
};

const inspectorTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
  fontWeight: 500,
};

const inspectorSubtitleStyle: React.CSSProperties = {
  marginTop: 3,
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
};

const inspectorFieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const inspectorLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const inspectorInputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  background: 'var(--bg-overlay)',
  border: '0.5px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  outline: 'none',
  padding: '7px 8px',
  colorScheme: 'inherit',
};


const customSelectTriggerStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 6,
  background: 'var(--bg-overlay)',
  border: '0.5px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  outline: 'none',
  padding: '7px 8px',
  cursor: 'pointer',
  textAlign: 'left',
};

const customDropdownListStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  marginTop: 4,
  background: 'var(--bg-surface)',
  border: '0.5px solid var(--border)',
  borderRadius: 8,
  boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
  zIndex: 200,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  padding: '4px',
};

const customDropdownItemStyle: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  padding: '6px 8px',
  background: 'none',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
};

const inspectorSaveDefaultBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  marginTop: 4,
  padding: '7px 10px',
  background: 'var(--bg-overlay)',
  border: '0.5px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  cursor: 'pointer',
};

const savedDefaultItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 0',
};

const savedDefaultAddBtnStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '3px 0',
  textAlign: 'left',
};

const savedDefaultDeleteBtnStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  flexShrink: 0,
  borderRadius: '50%',
  border: '0.5px solid var(--border)',
  background: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: 'var(--text-muted)',
};

const composeTabBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexWrap: 'wrap',
  padding: '0 20px 12px',
  flexShrink: 0,
};

const composeTabStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  maxWidth: 180,
  padding: '5px 8px 5px 9px',
  borderRadius: 6,
  border: '0.5px solid var(--border)',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  transition: 'background 100ms ease, border-color 100ms ease, color 100ms ease',
};

const composeTabIconStyle: React.CSSProperties = {
  fontSize: 15,
  flexShrink: 0,
};

const composeTabLabelStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const composeTabCloseStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  flexShrink: 0,
  borderRadius: '50%',
  border: 'none',
  background: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: 'var(--text-muted)',
};

const composeTabNewStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 10px 5px 7px',
  borderRadius: 6,
  border: '0.5px dashed var(--border)',
  background: 'none',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
};

const composeTabNewLabelStyle: React.CSSProperties = {
  whiteSpace: 'nowrap',
};

const composeEditorWrapStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  padding: '0 20px 16px',
};

const composeEditorMetaStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 8,
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  color: 'var(--text-muted)',
};

const composeEditorTextareaStyle: React.CSSProperties = {
  flex: 1,
  width: '100%',
  minHeight: 0,
  display: 'block',
  resize: 'none',
  background: 'var(--bg-surface)',
  border: '0.5px solid var(--border)',
  borderRadius: 6,
  outline: 'none',
  padding: '14px',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  lineHeight: 1.6,
  color: 'var(--text-primary)',
  whiteSpace: 'pre-wrap',
};

const composeEmptyStyle: React.CSSProperties = {
  flex: 1,
  padding: '0 20px',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-sm)',
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

const libraryHintStyle: React.CSSProperties = {
  marginTop: 6,
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  lineHeight: 1.4,
};

const librarySubLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 2,
};

const libraryEmptyStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  padding: '2px 0 4px',
  lineHeight: 1.4,
};

const helperTextStyle: React.CSSProperties = {
  marginTop: 6,
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
};


const libraryItemTextStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const libraryItemNameStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-sm)',
  lineHeight: 1.3,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const libraryItemKindStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 10,
  lineHeight: 1,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
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

const reviewWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const reviewHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
};

const reviewTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
  fontWeight: 500,
};

const reviewSubtitleStyle: React.CSSProperties = {
  marginTop: 3,
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
};

const reviewErrorBadgeStyle: React.CSSProperties = {
  padding: '3px 8px',
  borderRadius: 999,
  background: 'rgba(239,68,68,0.12)',
  color: '#ef4444',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
};

const reviewListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const reviewItemStyle: React.CSSProperties = {
  border: '0.5px solid var(--border)',
  borderRadius: 6,
  background: 'var(--bg-surface)',
  padding: 12,
};

const reviewItemHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 10,
};

const reviewItemTitleStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
  fontWeight: 500,
};

const reviewPathStyle: React.CSSProperties = {
  display: 'block',
  marginTop: 3,
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  color: 'var(--text-muted)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const reviewModeStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '3px 7px',
  borderRadius: 999,
  border: '0.5px solid var(--border)',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-ui)',
  fontSize: 11,
};

const reviewMetaGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1.4fr',
  gap: 8,
  marginTop: 10,
};

const reviewMetaStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
};

const reviewMetaLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 10,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const reviewMetaValueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  color: 'var(--text-secondary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const reviewInlineErrorStyle: React.CSSProperties = {
  marginTop: 9,
  color: '#ef4444',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
};

const reviewReferencesStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const referenceListStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
};

const referencePillStyle: React.CSSProperties = {
  padding: '3px 7px',
  borderRadius: 999,
  background: 'var(--bg-overlay)',
  border: '0.5px solid var(--border)',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
};

const reviewEmptyStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
};

const reviewBlockingStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 4,
  background: 'rgba(239,68,68,0.08)',
  color: '#ef4444',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  lineHeight: 1.4,
};

const defaultsErrorStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderRadius: 4,
  background: 'rgba(239,68,68,0.08)',
  color: '#ef4444',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  lineHeight: 1.4,
};
