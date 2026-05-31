import { autocompletion, CompletionContext, type Completion } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

function tableCompletionSource(context: CompletionContext) {
  const word = context.matchBefore(/\/\w*/);
  if (!word || !word.text.startsWith('/t')) return null;

  return {
    from: word.from,
    to: word.to,
    options: [
      {
        label: '/tabela',
        detail: 'Inserir tabela markdown',
        apply(view: EditorView, _completion: Completion, from: number, to: number) {
          view.dispatch({ changes: { from, to, insert: '' } });
          const coords = view.coordsAtPos(view.state.selection.main.head);
          const event = new CustomEvent('open-table-picker', {
            detail: {
              left: coords?.left ?? 0,
              top: (coords?.bottom ?? 0) + 4,
            },
          });
          window.dispatchEvent(event);
        },
      },
    ],
  };
}

export function tableAutocomplete(): Extension {
  return autocompletion({
    override: [tableCompletionSource],
    activateOnTyping: true,
    closeOnBlur: true,
    maxRenderedOptions: 10,
  });
}
