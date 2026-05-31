# Agent Configuration Manager

## O que é

O Agent Configuration Manager é uma feature do TypeWriter que resolve um problema real de quem trabalha com IA diariamente: a criação manual e repetitiva de arquivos de configuração de agentes (`CLAUDE.md`, `AGENTS.md`) para cada projeto e contexto de trabalho.

Em vez de escrever esses arquivos do zero ou adaptar versões antigas, o TypeWriter oferece um composer visual onde você escolhe o contexto, seleciona peças modulares e injeta o arquivo pronto no diretório do projeto.

---

## O problema que resolve

Devs que trabalham com múltiplos agentes de IA enfrentam um padrão repetitivo:

- Cada projeto novo exige um `CLAUDE.md` diferente
- O mesmo projeto pode ter 3 agentes com configurações distintas
- Mudar de contexto (bug fix → MVP → code review) exige reescrever instruções
- Skills reutilizáveis (como padrões de código, identidade visual, instruções de ferramentas) são copiadas manualmente entre projetos

O resultado é inconsistência, retrabalho e tempo gasto em configuração ao invés de desenvolvimento.

---

## Fluxo principal

```
CHOOSE → ARTIFACTS → COMPOSE → INJECT
```

### 1. Choose — escolha o contexto

Selecione o tipo de trabalho que o agente vai realizar:

| Tipo | Quando usar |
|---|---|
| **MVP / Do zero** | Construir projeto novo, orientado a velocidade |
| **Projeto existente** | Agente deve buscar contexto antes de agir, não explorar cego |
| **Bug fix** | Precisão, correlação de chamadas, análise da causa raiz |
| **Arquitetura** | Decisões estruturais, ADRs, planejamento |
| **Code review** | Qualidade, padrões, segurança |
| **Custom** | Criar e salvar seu próprio tipo de contexto |

Cada tipo carrega um template base com instruções otimizadas para aquela situação.

### 2. Artifacts — escolha o que criar

Selecione um ou mais artefatos que o TypeWriter deve criar para o contexto escolhido:

- **Agent**
- **Doc**
- **Prompt**
- **Skill**
- **Markdown**

O fluxo só avança depois de pelo menos uma opção marcada.

### 3. Compose — monte as peças

Selecione as skills e docs do seu vault que devem ser injetadas no arquivo:

- **Skills** — instruções técnicas por stack (`kotlin-android.md`, `tauri-rust.md`, `spring-boot.md`)
- **Docs** — contexto de projeto (`identidade-visual.md`, `api-contracts.md`, `codegraph-instructions.md`)

O preview ao lado mostra o conteúdo real do arquivo que será gerado, atualizado em tempo real conforme você seleciona.

### 4. Inject — defina o destino

Escolha o diretório do projeto (via input ou file picker nativo) e o nome do arquivo (`CLAUDE.md`, `AGENTS.md`, ou custom). O TypeWriter escreve o arquivo diretamente no filesystem.

---

## Estrutura do vault

O Agent Configuration Manager usa a seguinte estrutura dentro do vault do TypeWriter:

```
/vault/
  agents/
    templates/          ← templates base por tipo de contexto
      mvp-do-zero.md
      projeto-existente.md
      bug-fix.md
      arquitetura.md
      code-review.md
    gerados/            ← histórico dos arquivos gerados
  skills/               ← skills modulares reutilizáveis
    kotlin-android.md
    tauri-rust.md
    frontend-design.md
    spring-boot.md
  docs/                 ← documentos injetáveis
    identidade-visual.md
    codegraph-instructions.md
```

Todos os arquivos são markdown simples — editáveis diretamente no TypeWriter como qualquer outra nota.

---

## Arquivo gerado

O arquivo final é a concatenação de:

```
[header com metadata]
[conteúdo do template base]
---
[conteúdo das skills selecionadas]
---
[conteúdo dos docs selecionados]
```

**Exemplo de header gerado:**
```markdown
<!-- gerado pelo TypeWriter em 2026-05-31 17:38 -->
<!-- template: bug-fix | artefatos: Agent, Prompt | skills: kotlin-android, tauri-rust -->
```

---

## Como acessar

- Botão dedicado na sidebar esquerda do TypeWriter
- Atalho de teclado: `Ctrl+Shift+G`

---

## Como criar seus próprios templates e skills

### Novo template de contexto
1. No composer, clique em "Criar novo tipo"
2. Digite o nome e o conteúdo do template
3. Salvo automaticamente em `/vault/agents/templates/[nome].md`
4. Disponível nas próximas sessões

### Nova skill
1. Crie uma nota em `/vault/skills/[nome].md` no file explorer
2. Escreva as instruções da skill em markdown
3. Ela aparece automaticamente no checklist do Composer

### Novo doc
1. Crie uma nota em `/vault/docs/[nome].md`
2. Mesma lógica das skills

---

## Histórico de injeções

Cada injeção é registrada no SQLite local:

```
template usado · skills injetadas · docs injetados · diretório de destino · data
```

Os últimos 5 diretórios usados aparecem como sugestão no Step 3 para acelerar o fluxo.

---

## Integração com o restante do TypeWriter

O Agent Configuration Manager não é um módulo isolado — ele usa a infraestrutura existente do TypeWriter:

- **Vault** — fonte dos templates, skills e docs
- **File Explorer** — para navegar e editar os arquivos do vault
- **Editor** — para escrever e manter templates e skills como notas normais
- **SQLite** — para persistir histórico e diretórios recentes

Qualquer arquivo em `/vault/skills/` ou `/vault/docs/` é automaticamente detectado pelo Composer. Criar uma skill é o mesmo que criar uma nota.

---

## Casos de uso reais

**Iniciando um projeto novo com Tauri + Kotlin:**
```
Choose  → MVP / Do zero
Artifacts → Agent + Markdown
Compose → skills: tauri-rust + kotlin-android
          docs: identidade-visual
Inject  → /c/projetos/novo-app/CLAUDE.md
```

**Investigando um bug num projeto existente:**
```
Choose  → Bug fix
Artifacts → Prompt
Compose → skills: kotlin-android
          docs: codegraph-instructions
Inject  → /c/projetos/ipiranga-online/CLAUDE.md
```

**Revisando arquitetura antes de uma feature grande:**
```
Choose  → Arquitetura
Artifacts → Doc + Agent
Compose → skills: spring-boot + tauri-rust
Inject  → /c/projetos/devscribe/AGENTS.md
```

---

## Stack técnica

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript |
| Desktop | Tauri v2 (Rust) |
| Filesystem | tauri-plugin-fs |
| File picker | tauri-plugin-dialog |
| Persistência | SQLite via tauri-plugin-sql |

---

## Status

| Task | Status |
|---|---|
| TASK-21a — Estrutura do vault + arquivos de exemplo | `pendente` |
| TASK-21b — Dialog shell + TemplateSelector | `pendente` |
| TASK-21c — Composer (checklist + preview) | `pendente` |
| TASK-21d — InjectStep + SQLite + finalização | `pendente` |
