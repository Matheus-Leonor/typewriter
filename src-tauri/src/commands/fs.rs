use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize, Clone)]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub modified: u64,
    pub created: u64,
}

fn to_millis(t: SystemTime) -> u64 {
    t.duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<FsEntry>, String> {
    let mut result = Vec::new();
    for entry in fs::read_dir(&path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        let is_dir = meta.is_dir();
        if !is_dir && !name.ends_with(".md") {
            continue;
        }
        result.push(FsEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir,
            modified: meta.modified().map(to_millis).unwrap_or(0),
            created: meta.created().map(to_millis).unwrap_or(0),
        });
    }
    Ok(result)
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_note(dir_path: String, name: String) -> Result<String, String> {
    let name = if name.ends_with(".md") {
        name
    } else {
        format!("{}.md", name)
    };
    let path = Path::new(&dir_path).join(&name);
    fs::write(&path, "").map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn create_folder(dir_path: String, name: String) -> Result<String, String> {
    let path = Path::new(&dir_path).join(&name);
    fs::create_dir(&path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn rename_entry(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_entry(path: String) -> Result<(), String> {
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(&path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn duplicate_note(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    let parent = p.parent().ok_or("sem diretório pai")?;
    let stem = p
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("nome inválido")?;
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("md");

    let mut new_path = parent.join(format!("{} copy.{}", stem, ext));
    let mut counter = 2;
    while new_path.exists() {
        new_path = parent.join(format!("{} copy {}.{}", stem, counter, ext));
        counter += 1;
    }
    fs::copy(&path, &new_path).map_err(|e| e.to_string())?;
    Ok(new_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn ensure_agent_workspace(vault_path: String) -> Result<(), String> {
    let root = Path::new(&vault_path);

    let dirs = ["agents/templates", "agents/gerados", "skills", "docs"];
    for dir in &dirs {
        fs::create_dir_all(root.join(dir)).map_err(|e| e.to_string())?;
    }

    let files: &[(&str, &str)] = &[
        (
            "agents/templates/mvp-do-zero.md",
            "---\ntipo: template\ncontexto: mvp-do-zero\n---\n\n# CLAUDE.md — MVP do Zero\n\nVocê está construindo um projeto novo do zero. Entregue algo funcionando o mais rápido possível.\n\n## Contexto do Projeto\n[Descreva o que o projeto faz e para quem]\n\n## Stack\n[Liste as tecnologias principais]\n\n## Objetivo do MVP\n[O que o MVP precisa fazer minimamente para ser considerado funcional]\n\n## Fora do Escopo do MVP\n[Liste o que pode esperar para depois]\n",
        ),
        (
            "agents/templates/projeto-existente.md",
            "---\ntipo: template\ncontexto: projeto-existente\n---\n\n# CLAUDE.md — Projeto Existente\n\nVocê está evoluindo um projeto já em andamento.\n\n## O Projeto\n[Descreva o projeto]\n\n## Estado Atual\n[O que já está implementado]\n\n## Objetivo desta Sessão\n[O que precisa ser feito agora]\n\n## Restrições\n[Não quebrar X, manter compatibilidade com Y, etc.]\n",
        ),
        (
            "agents/templates/bug-fix.md",
            "---\ntipo: template\ncontexto: bug-fix\n---\n\n# CLAUDE.md — Bug Fix\n\nVocê está investigando e corrigindo um bug específico.\n\n## O Bug\n[Descreva o comportamento incorreto]\n\n## Comportamento Esperado\n[O que deveria acontecer]\n\n## Como Reproduzir\n1. [Passo 1]\n2. [Passo 2]\n\n## Hipóteses\n[Possíveis causas]\n\n## Regras\n- Não altere nada além do escopo do bug\n- Se encontrar problemas adjacentes, proponha tasks separadas\n",
        ),
        (
            "agents/templates/arquitetura.md",
            "---\ntipo: template\ncontexto: arquitetura\n---\n\n# CLAUDE.md — Decisão de Arquitetura\n\nVocê está avaliando ou implementando uma decisão arquitetural.\n\n## O Problema\n[O que precisa ser resolvido]\n\n## Opções Consideradas\n1. [Opção A] — prós e contras\n2. [Opção B] — prós e contras\n\n## Decisão\n[O que foi decidido e por quê]\n\n## Consequências\n[O que muda com essa decisão; débito técnico eventual]\n",
        ),
        (
            "agents/templates/code-review.md",
            "---\ntipo: template\ncontexto: code-review\n---\n\n# CLAUDE.md — Code Review\n\nVocê está revisando código para qualidade, segurança e boas práticas.\n\n## Escopo\n[Quais arquivos ou funcionalidades revisar]\n\n## Critérios\n- Correctness: o código faz o que deveria?\n- Segurança: há vulnerabilidades?\n- Legibilidade: o código é claro e idiomático?\n- Performance: há gargalos evidentes?\n\n## Nível de Detalhe\n[Superficial / Detalhado / Completo]\n",
        ),
        (
            "skills/kotlin-android.md",
            "---\ntipo: skill\nnome: kotlin-android\n---\n\n# Skill — Kotlin Android\n\nDesenvolvimento Android com Kotlin moderno.\n\n## Stack\n- Kotlin + Coroutines\n- Jetpack Compose\n- ViewModel + StateFlow\n- Room para persistência local\n\n## Padrões\n- MVVM como arquitetura padrão\n- Hilt para injeção de dependência\n- Flows para streams de dados reativos\n- Composables stateless quando possível\n\n## Regras\n- Nunca usar AsyncTask (depreciado)\n- Preferir StateFlow sobre LiveData em código novo\n- Testes com Turbine para flows\n",
        ),
        (
            "skills/tauri-rust.md",
            "---\ntipo: skill\nnome: tauri-rust\n---\n\n# Skill — Tauri + Rust\n\nDesenvolvimento desktop com Tauri v2 e Rust no backend.\n\n## Estrutura\n- Comandos Tauri em `src-tauri/src/commands/`\n- Estado compartilhado via `tauri::State`\n- Erros retornados como `Result<T, String>`\n\n## Regras\n- Nenhum componente chama `invoke()` diretamente — só via camada de abstração em `src/`\n- Operações de filesystem via `std::fs` no Rust\n- Comandos async para operações de I/O bloqueantes\n- Não expor paths internos do sistema na API\n",
        ),
        (
            "skills/frontend-design.md",
            "---\ntipo: skill\nnome: frontend-design\n---\n\n# Skill — Frontend Design System\n\nConstrução de interfaces com CSS Variables e design tokens.\n\n## Padrões\n- Tokens centralizados — cores, fontes e tamanhos em um único arquivo\n- CSS Variables para todos os valores visuais\n- Nenhum valor hardcoded em inline styles\n- Sem bibliotecas de UI externas (MUI, Chakra, Radix, etc.)\n\n## Nomenclatura\n- `--bg-primary`, `--bg-surface` para backgrounds\n- `--text-primary`, `--text-muted` para textos\n- `--accent` para cor de destaque\n- `--space-*` para espaçamentos\n- `--text-sm`, `--text-base` para tamanhos de fonte\n",
        ),
        (
            "skills/spring-boot.md",
            "---\ntipo: skill\nnome: spring-boot\n---\n\n# Skill — Spring Boot\n\nAPIs REST com Spring Boot 3+ e Java/Kotlin.\n\n## Estrutura\n- Controller → Service → Repository\n- DTOs para entrada e saída de dados\n- Validação com Bean Validation (`@Valid`)\n- Exceções tratadas via `@ControllerAdvice`\n\n## Regras\n- Nunca expor entidades JPA diretamente na API\n- Transações no nível de serviço (`@Transactional`)\n- Testes de integração com `@SpringBootTest`\n- Migrations via Flyway ou Liquibase\n",
        ),
        (
            "docs/identidade-visual.md",
            "---\ntipo: doc\nnome: identidade-visual\n---\n\n# Identidade Visual\n\n## Princípios\n[Descreva os princípios visuais do projeto — minimalista, vibrante, técnico, etc.]\n\n## Paleta de Cores\n- Primária: [cor e uso]\n- Secundária: [cor e uso]\n- Acento: [cor e uso]\n- Erro / Alerta: [cor e uso]\n\n## Tipografia\n- Interface: [fonte]\n- Corpo de texto: [fonte]\n- Código: [fonte]\n\n## Iconografia\n[Sistema de ícones utilizado e regras de uso]\n\n## Espaçamento\n[Escala de espaçamento e quando usar cada nível]\n",
        ),
        (
            "docs/codegraph-instructions.md",
            "---\ntipo: doc\nnome: codegraph-instructions\n---\n\n# CodeGraph — Instruções de Uso\n\nCodeGraph é um servidor MCP com grafo de conhecimento do código (tree-sitter). Leituras são sub-milissegundo.\n\n## Quando usar\n\n| Pergunta | Tool |\n|---|---|\n| Onde X está definido? | `codegraph_search` |\n| O que chama Y? | `codegraph_callers` |\n| O que Y chama? | `codegraph_callees` |\n| Como X chega em Y? | `codegraph_trace` |\n| O que mudaria se eu alterar Z? | `codegraph_impact` |\n| Contexto de uma feature/área | `codegraph_context` |\n| Ver source de vários símbolos | `codegraph_explore` |\n\n## Regras\n- Use codegraph para perguntas **estruturais** — o que chama o quê, onde está definido\n- Use grep/read para conteúdo **literal** — strings, comentários, mensagens de log\n- Não re-verifique resultados do codegraph com grep — ele é autoritativo\n- Para fluxos (`X → Y`), comece com `codegraph_trace` — uma chamada retorna o caminho inteiro\n",
        ),
    ];

    for (rel_path, content) in files {
        let path = root.join(rel_path);
        if !path.exists() {
            fs::write(&path, content).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn list_vault_directory(vault_path: String, subdir: String) -> Result<Vec<FsEntry>, String> {
    let path = Path::new(&vault_path).join(subdir);
    list_dir(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn read_vault_file(path: String) -> Result<String, String> {
    read_file(path)
}

#[tauri::command]
pub fn watch_vault(
    path: String,
    app_handle: AppHandle,
    state: State<'_, crate::WatcherState>,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = None; // drop previous watcher

    let app = app_handle.clone();
    let mut watcher = RecommendedWatcher::new(
        move |res: notify::Result<notify::Event>| {
            if res.is_ok() {
                app.emit("vault-changed", ()).ok();
            }
        },
        Config::default(),
    )
    .map_err(|e| e.to_string())?;

    watcher
        .watch(path.as_ref(), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    *guard = Some(watcher);
    Ok(())
}
