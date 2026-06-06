import { useMemo } from 'react';
import { marked } from 'marked';

/* ============================================================================
   MarkdownPreview — ilha de pre-visualizacao a direita (Island design system).
   Renderiza o conteudo atual do editor como HTML via `marked`. Substitui o
   antigo preview inline. Conteudo e do proprio vault local do usuario.
   ========================================================================== */

marked.setOptions({ gfm: true, breaks: true });

interface Props {
  content: string;
  title?: string;
  onClose: () => void;
}

export function MarkdownPreview({ content, title = 'Preview', onClose }: Props) {
  const html = useMemo(() => marked.parse(content) as string, [content]);

  return (
    <div className="is-island is-preview">
      <div className="is-preview-head">
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--ink-3)' }}>visibility</span>
        <span className="is-preview-title">{title}</span>
        <div style={{ flex: 1 }} />
        <button className="is-term-btn" title="Fechar preview" onClick={onClose}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
        </button>
      </div>
      <div className="is-preview-body md-preview" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
