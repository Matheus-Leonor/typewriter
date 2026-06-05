export const COMPOSE_SECTION_TYPES = ['agent', 'doc', 'prompt', 'skill', 'markdown'] as const;

export type ComposeSectionType = (typeof COMPOSE_SECTION_TYPES)[number];
export type ComposeSectionCategory = 'primary' | 'artifact';
export type ComposeInjectionMode = 'create' | 'overwrite' | 'append';

export interface ComposeSection {
  id: string;
  tipo: ComposeSectionType;
  titulo: string;
  filename: string;
  directory: string;
  content: string;
  isPinned: boolean;
  category: ComposeSectionCategory;
  includeInAgent: boolean;
  injectionMode: ComposeInjectionMode;
}

export interface ComposeState {
  id: string;
  templateId: string;
  templateSlug: string;
  primarySectionId: string;
  sections: ComposeSection[];
  updatedAt: number;
}

export interface ComposeInjectionPlanItem {
  sectionId: string;
  title: string;
  filename: string;
  directory: string;
  fullPath: string;
  mode: ComposeInjectionMode;
  content: string;
  isPrimary: boolean;
  references: string[];
  errors: string[];
}

export interface ComposeArtifactDefinition {
  id: ComposeSectionType;
  name: string;
  icon: string;
  defaultFilename: string;
  includeInAgentByDefault: boolean;
}

export const COMPOSE_ARTIFACTS: ComposeArtifactDefinition[] = [
  {
    id: 'agent',
    name: 'Agent',
    icon: 'smart_toy',
    defaultFilename: 'AGENTS.md',
    includeInAgentByDefault: true,
  },
  {
    id: 'doc',
    name: 'Doc',
    icon: 'article',
    defaultFilename: 'doc.md',
    includeInAgentByDefault: true,
  },
  {
    id: 'prompt',
    name: 'Prompt',
    icon: 'chat',
    defaultFilename: 'prompt.md',
    includeInAgentByDefault: true,
  },
  {
    id: 'skill',
    name: 'Skill',
    icon: 'extension',
    defaultFilename: 'skill.md',
    includeInAgentByDefault: true,
  },
  {
    id: 'markdown',
    name: 'Markdown',
    icon: 'markdown',
    defaultFilename: 'markdown.md',
    includeInAgentByDefault: true,
  },
];

export const COMPOSE_ARTIFACT_BY_ID = new Map(
  COMPOSE_ARTIFACTS.map((artifact) => [artifact.id, artifact]),
);

const MINIMAL_SECTION_CONTENT: Record<Exclude<ComposeSectionType, 'agent'>, string> = {
  doc: '# Documento\n\nDescreva o contexto, referencias e detalhes importantes aqui.\n',
  prompt: '# Prompt\n\nEscreva a instrucao principal, entradas esperadas e formato de saida.\n',
  skill: '# Skill\n\n## Quando usar\n\nDescreva quando esta skill deve ser aplicada.\n\n## Workflow\n\n1. Defina os passos principais.\n',
  markdown: '# Markdown\n\nComece a escrever aqui.\n',
};

const REFERENCES_HEADING = '## Referências';
const REFERENCES_START = '<!-- TypeWriter references:start -->';
const REFERENCES_END = '<!-- TypeWriter references:end -->';

function normalizePathSeparators(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/\/+/g, '/');
}

function stripTrailingSlash(path: string): string {
  return path.replace(/\/+$/, '');
}

function splitRoot(path: string): { root: string; parts: string[] } {
  const normalized = stripTrailingSlash(normalizePathSeparators(path));
  const drive = normalized.match(/^([A-Za-z]:)(?:\/|$)/);
  if (drive) {
    return {
      root: drive[1].toLowerCase(),
      parts: normalized.slice(drive[0].length).split('/').filter(Boolean),
    };
  }

  if (normalized.startsWith('/')) {
    return { root: '/', parts: normalized.slice(1).split('/').filter(Boolean) };
  }

  return { root: '', parts: normalized.split('/').filter(Boolean) };
}

function buildPath(directory: string, filename: string): string {
  const dir = stripTrailingSlash(normalizePathSeparators(directory));
  const file = normalizePathSeparators(filename).replace(/^\/+/, '');
  return dir ? `${dir}/${file}` : file;
}

function buildRelativeReferencePath(agentDirectory: string, targetDirectory: string, filename: string): string {
  const cleanFilename = normalizePathSeparators(filename).replace(/^\/+/, '');
  const targetPath = buildPath(targetDirectory, cleanFilename);
  const agentRoot = splitRoot(agentDirectory);
  const targetRoot = splitRoot(targetPath);

  if (agentRoot.root !== targetRoot.root) {
    return targetPath.replace(/^\.?\//, '');
  }

  let shared = 0;
  while (
    shared < agentRoot.parts.length &&
    shared < targetRoot.parts.length &&
    agentRoot.parts[shared].toLowerCase() === targetRoot.parts[shared].toLowerCase()
  ) {
    shared += 1;
  }

  const up = agentRoot.parts.slice(shared).map(() => '..');
  const down = targetRoot.parts.slice(shared);
  const relative = [...up, ...down].join('/');

  return relative || cleanFilename;
}

function buildAgentReferences(compose: ComposeState, agentSection: ComposeSection): string[] {
  const references = compose.sections
    .filter((section) => section.id !== agentSection.id)
    .filter((section) => section.includeInAgent)
    .map((section) => ({
      filename: section.filename.trim(),
      directory: section.directory.trim(),
    }))
    .filter((section) => section.filename.toLowerCase().endsWith('.md'))
    .map((section) => `@${buildRelativeReferencePath(agentSection.directory, section.directory, section.filename)}`);

  return [...new Set(references)];
}

function findReferencesSection(content: string): { start: number; end: number; headingEnd: number } | null {
  const headingMatch = /^## Refer[eê]ncias\s*$/im.exec(content);
  if (!headingMatch) return null;

  const headingEnd = content.indexOf('\n', headingMatch.index);
  const bodyStart = headingEnd === -1 ? content.length : headingEnd + 1;
  const nextHeadingMatch = /\n##\s+/.exec(content.slice(bodyStart));

  return {
    start: headingMatch.index,
    end: nextHeadingMatch ? bodyStart + nextHeadingMatch.index : content.length,
    headingEnd: bodyStart,
  };
}

function removeGeneratedReferenceDuplicates(body: string, references: string[]): string {
  const generated = new Set(references.map((reference) => `- ${reference}`));
  return body
    .split('\n')
    .filter((line) => !generated.has(line.trim()))
    .join('\n')
    .trim();
}

function buildReferencesBlock(references: string[]): string {
  return [
    REFERENCES_START,
    ...references.map((reference) => `- ${reference}`),
    REFERENCES_END,
  ].join('\n');
}

function updateAgentReferencesSection(content: string, references: string[]): string {
  const section = findReferencesSection(content);
  const nextBlock = references.length > 0 ? buildReferencesBlock(references) : '';

  if (!section) {
    return references.length > 0
      ? `${content.trimEnd()}\n\n${REFERENCES_HEADING}\n\n${nextBlock}\n`
      : content;
  }

  const before = content.slice(0, section.start).trimEnd();
  const sectionText = content.slice(section.start, section.end);
  const after = content.slice(section.end).trimStart();
  const headingLineEnd = sectionText.indexOf('\n');
  const body = headingLineEnd === -1 ? '' : sectionText.slice(headingLineEnd + 1);
  const managedBlockPattern = new RegExp(
    `${REFERENCES_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${REFERENCES_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
  );
  const unmanagedBody = removeGeneratedReferenceDuplicates(
    body.replace(managedBlockPattern, '').trim(),
    references,
  );

  if (references.length === 0 && !unmanagedBody) {
    return [before, after].filter(Boolean).join('\n\n');
  }

  const nextBody = [nextBlock, unmanagedBody].filter(Boolean).join('\n\n');
  return [before, `${REFERENCES_HEADING}\n\n${nextBody}`, after].filter(Boolean).join('\n\n').trimEnd() + '\n';
}

export function syncComposeAgentReferences(compose: ComposeState | null): ComposeState | null {
  if (!compose) return compose;

  let changed = false;
  const sections = compose.sections.map((section) => {
    if (section.tipo !== 'agent') return section;

    const references = buildAgentReferences(compose, section);
    const content = updateAgentReferencesSection(section.content, references);
    if (content === section.content) return section;

    changed = true;
    return { ...section, content };
  });

  return changed ? { ...compose, sections, updatedAt: Date.now() } : compose;
}

export interface ComposeSectionDefault {
  titulo: string;
  tipo: ComposeSectionType;
  category: ComposeSectionCategory;
  content: string;
  filename: string;
  includeInAgent: boolean;
  injectionMode: ComposeInjectionMode;
}

function coerceSectionType(value: string): ComposeSectionType {
  return (COMPOSE_SECTION_TYPES as readonly string[]).includes(value)
    ? (value as ComposeSectionType)
    : 'markdown';
}

function coerceInjectionMode(value: unknown): ComposeInjectionMode {
  return value === 'overwrite' || value === 'append' ? value : 'create';
}

/**
 * Derive a stable id for a saved default from its identity (tipo + titulo).
 * Saving the same section twice yields the same id, so the backend UPSERT
 * updates the existing row instead of creating a duplicate "Fixado".
 */
export function composeDefaultId(section: Pick<ComposeSection, 'tipo' | 'titulo'>): string {
  const slug = section.titulo
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  return `default-${section.tipo}-${slug || 'sem-titulo'}`;
}

/** Build a reusable default from a compose section (without the per-target directory). */
export function toComposeSectionDefault(section: ComposeSection): ComposeSectionDefault {
  return {
    titulo: section.titulo,
    tipo: section.tipo,
    category: section.category,
    content: section.content,
    filename: section.filename,
    includeInAgent: section.includeInAgent,
    injectionMode: section.injectionMode,
  };
}

/** Reconstruct a default from a persisted record (content/category/tipo + metadata blob). */
export function composeSectionDefaultFromRecord(record: {
  titulo: string;
  content: string;
  category: string;
  tipo: string;
  metadata: string;
}): ComposeSectionDefault {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(record.metadata) as Record<string, unknown>;
  } catch {
    metadata = {};
  }

  const tipo = coerceSectionType(record.tipo);
  return {
    titulo: record.titulo,
    tipo,
    category: record.category === 'primary' ? 'primary' : 'artifact',
    content: record.content,
    filename:
      typeof metadata.filename === 'string' && metadata.filename.trim()
        ? metadata.filename
        : COMPOSE_ARTIFACT_BY_ID.get(tipo)?.defaultFilename ?? 'markdown.md',
    includeInAgent:
      typeof metadata.includeInAgent === 'boolean' ? metadata.includeInAgent : true,
    injectionMode: coerceInjectionMode(metadata.injectionMode),
  };
}

/**
 * Add a saved default as a new artifact section in the current compose.
 * Deduplicates: if a section with the same titulo + tipo + content already
 * exists, it is reused instead of appending a duplicate (returns it unchanged).
 */
export function addComposeSectionFromDefault(
  compose: ComposeState | null,
  def: ComposeSectionDefault,
  targetDirectory: string,
): ComposeState | null {
  if (!compose) return compose;

  const alreadyPresent = compose.sections.some(
    (section) =>
      section.tipo === def.tipo &&
      section.titulo === def.titulo &&
      section.content === def.content,
  );
  if (alreadyPresent) return compose;

  const section: ComposeSection = {
    id: createComposeId('section'),
    tipo: def.tipo,
    titulo: def.titulo,
    filename: def.filename,
    directory: targetDirectory,
    content: def.content,
    isPinned: false,
    category: 'artifact',
    includeInAgent: def.includeInAgent,
    injectionMode: def.injectionMode,
  };

  return syncComposeAgentReferences({
    ...compose,
    sections: [...compose.sections, section],
    updatedAt: Date.now(),
  });
}

/** Create a fresh, empty markdown section for the "New file" action. */
export function createBlankComposeSection(
  targetDirectory: string,
  tipo: ComposeSectionType = 'markdown',
): ComposeSection {
  const artifact = COMPOSE_ARTIFACT_BY_ID.get(tipo)!;
  return {
    id: createComposeId('section'),
    tipo,
    titulo: artifact.name,
    filename: artifact.defaultFilename,
    directory: targetDirectory,
    content: createDefaultSectionContent(tipo, ''),
    isPinned: false,
    category: 'artifact',
    includeInAgent: artifact.includeInAgentByDefault,
    injectionMode: 'create',
  };
}

/** Append an arbitrary section to the compose state. */
export function addComposeSection(
  compose: ComposeState | null,
  section: ComposeSection,
): ComposeState | null {
  if (!compose) return compose;
  return syncComposeAgentReferences({
    ...compose,
    sections: [...compose.sections, section],
    updatedAt: Date.now(),
  });
}

/**
 * Remove a section by id. Refuses to remove the last remaining section.
 * Reassigns the primary section if the removed one was primary.
 */
export function removeComposeSection(
  compose: ComposeState | null,
  sectionId: string,
): ComposeState | null {
  if (!compose) return compose;
  if (compose.sections.length <= 1) return compose;
  if (!compose.sections.some((section) => section.id === sectionId)) return compose;

  const remaining = compose.sections.filter((section) => section.id !== sectionId);
  let primarySectionId = compose.primarySectionId;

  if (primarySectionId === sectionId) {
    const nextPrimary = remaining.find((section) => section.tipo === 'agent') ?? remaining[0];
    primarySectionId = nextPrimary.id;
  }

  const sections = remaining.map((section) => ({
    ...section,
    isPinned: section.id === primarySectionId,
    category: section.id === primarySectionId ? 'primary' : section.category === 'primary' ? 'artifact' : section.category,
  } satisfies ComposeSection));

  return syncComposeAgentReferences({
    ...compose,
    primarySectionId,
    sections,
    updatedAt: Date.now(),
  });
}

export function createDefaultSectionContent(tipo: ComposeSectionType, agentContent: string): string {
  if (tipo === 'agent') return agentContent;
  return MINIMAL_SECTION_CONTENT[tipo];
}

export function createComposeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createComposeState(params: {
  templateId: string;
  templateSlug: string;
  selectedTypes: Iterable<ComposeSectionType>;
  targetDirectory?: string;
  agentContent: string;
}): ComposeState {
  const selectedTypes = [...params.selectedTypes];
  const orderedTypes = COMPOSE_ARTIFACTS
    .map((artifact) => artifact.id)
    .filter((id) => selectedTypes.includes(id));
  const primaryType = orderedTypes.includes('agent') ? 'agent' : orderedTypes[0];

  const sections = orderedTypes.map((tipo) => {
    const artifact = COMPOSE_ARTIFACT_BY_ID.get(tipo)!;
    const isPrimary = tipo === primaryType;

    return {
      id: createComposeId('section'),
      tipo,
      titulo: artifact.name,
      filename: artifact.defaultFilename,
      directory: params.targetDirectory ?? '',
      content: createDefaultSectionContent(tipo, params.agentContent),
      isPinned: isPrimary,
      category: isPrimary ? 'primary' : 'artifact',
      includeInAgent: artifact.includeInAgentByDefault,
      injectionMode: 'create',
    } satisfies ComposeSection;
  });

  return syncComposeAgentReferences({
    id: createComposeId('compose'),
    templateId: params.templateId,
    templateSlug: params.templateSlug,
    primarySectionId: sections.find((section) => section.isPinned)?.id ?? '',
    sections,
    updatedAt: Date.now(),
  })!;
}

export function updateComposeSectionContent(
  compose: ComposeState | null,
  sectionId: string,
  content: string,
): ComposeState | null {
  if (!compose) return compose;

  return syncComposeAgentReferences({
    ...compose,
    sections: compose.sections.map((section) =>
      section.id === sectionId ? { ...section, content } : section,
    ),
    updatedAt: Date.now(),
  });
}

export function updateComposeSectionSettings(
  compose: ComposeState | null,
  sectionId: string,
  patch: Partial<Pick<
    ComposeSection,
    'tipo' | 'titulo' | 'filename' | 'directory' | 'isPinned' | 'category' | 'includeInAgent' | 'injectionMode'
  >>,
): ComposeState | null {
  if (!compose) return compose;

  const shouldPin = patch.isPinned === true || patch.category === 'primary';
  const shouldUnpin = patch.isPinned === false || patch.category === 'artifact';
  const fallbackPrimaryId =
    compose.sections.find((section) => section.id !== sectionId && section.isPinned)?.id ??
    compose.sections.find((section) => section.id !== sectionId)?.id ??
    '';
  const primarySectionId = shouldPin
    ? sectionId
    : shouldUnpin && compose.primarySectionId === sectionId
      ? fallbackPrimaryId
      : compose.primarySectionId;

  return syncComposeAgentReferences({
    ...compose,
    primarySectionId,
    sections: compose.sections.map((section) => {
      if (section.id !== sectionId) {
        if (shouldPin) {
          return {
            ...section,
            isPinned: false,
            category: section.category === 'primary' ? 'artifact' : section.category,
          };
        }

        if (shouldUnpin && section.id === primarySectionId) {
          return { ...section, isPinned: true, category: 'primary' };
        }

        return section;
      }

      const next = { ...section, ...patch };
      if (shouldPin) {
        next.isPinned = true;
        next.category = 'primary';
      } else if (shouldUnpin) {
        next.isPinned = false;
        next.category = 'artifact';
      }
      return next;
    }),
    updatedAt: Date.now(),
  });
}

export function syncComposeDirectories(
  compose: ComposeState | null,
  directory: string,
): ComposeState | null {
  if (!compose) return compose;

  return syncComposeAgentReferences({
    ...compose,
    sections: compose.sections.map((section) => ({ ...section, directory })),
    updatedAt: Date.now(),
  });
}

export function getPrimarySection(compose: ComposeState | null): ComposeSection | null {
  if (!compose) return null;
  return compose.sections.find((section) => section.id === compose.primarySectionId) ?? null;
}

function validateFilename(filename: string): string[] {
  const errors: string[] = [];
  const clean = filename.trim();

  if (!clean) {
    errors.push('Nome do arquivo vazio');
    return errors;
  }

  if (/[\\/]/.test(clean)) {
    errors.push('Nome do arquivo nao pode conter diretorio');
  }

  if (/[<>:"|?*\u0000-\u001F]/.test(clean)) {
    errors.push('Nome do arquivo contem caracteres invalidos');
  }

  if (clean === '.' || clean === '..') {
    errors.push('Nome do arquivo invalido');
  }

  const stem = clean.split('.')[0]?.toUpperCase();
  if (stem && /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem)) {
    errors.push('Nome reservado pelo sistema');
  }

  return errors;
}

function validateDirectory(directory: string): string[] {
  const errors: string[] = [];
  const clean = directory.trim();

  if (!clean) {
    errors.push('Diretorio destino vazio');
    return errors;
  }

  if (/[\u0000-\u001F]/.test(clean)) {
    errors.push('Diretorio contem caracteres invalidos');
  }

  const normalized = normalizePathSeparators(clean);
  const withoutDrive = normalized.replace(/^[A-Za-z]:/, '');
  const segments = withoutDrive.split('/').filter(Boolean);
  const invalidSegment = segments.find((segment) => (
    segment === '.' ||
    segment === '..' ||
    /[<>"|?*]/.test(segment)
  ));

  if (invalidSegment) {
    errors.push('Diretorio contem segmento invalido');
  }

  return errors;
}

export function getComposeAgentReferences(compose: ComposeState | null): string[] {
  if (!compose) return [];
  const agentSection = compose.sections.find((section) => section.tipo === 'agent');
  return agentSection ? buildAgentReferences(compose, agentSection) : [];
}

export function buildComposeInjectionPlan(compose: ComposeState | null): ComposeInjectionPlanItem[] {
  if (!compose) return [];

  return compose.sections.map((section) => {
    const filename = section.filename.trim();
    const directory = section.directory.trim();
    const references = section.tipo === 'agent' ? buildAgentReferences(compose, section) : [];

    return {
      sectionId: section.id,
      title: section.titulo,
      filename,
      directory,
      fullPath: buildPath(directory, filename),
      mode: section.injectionMode,
      content: section.content,
      isPrimary: section.id === compose.primarySectionId,
      references,
      errors: [
        ...validateFilename(filename),
        ...validateDirectory(directory),
      ],
    };
  });
}
