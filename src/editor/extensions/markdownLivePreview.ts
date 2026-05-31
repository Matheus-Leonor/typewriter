import { Extension, Range, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

// ─── Widgets ─────────────────────────────────────────────────────────────────

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly markerFrom: number) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'cm-md-checkbox';
    box.checked = this.checked;
    box.onmousedown = (e) => {
      e.preventDefault();
      const newMarker = this.checked ? '[ ]' : '[x]';
      view.dispatch({
        changes: { from: this.markerFrom, to: this.markerFrom + 3, insert: newMarker },
      });
    };
    return box;
  }

  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.markerFrom === this.markerFrom;
  }

  ignoreEvent(): boolean { return false; }
}

class BulletWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-md-bullet';
    span.textContent = '•';
    return span;
  }

  eq(): boolean { return true; }
  ignoreEvent(): boolean { return true; }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sameLineAsCursor(
  state: EditorView['state'],
  selFrom: number,
  nodeFrom: number,
): boolean {
  return state.doc.lineAt(nodeFrom).number === state.doc.lineAt(selFrom).number;
}

// ─── Decoration builder ───────────────────────────────────────────────────────

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const sel = state.selection.main;
  const raw: Range<Decoration>[] = [];

  for (const { from: vFrom, to: vTo } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from: vFrom,
      to: vTo,
      enter(node) {
        const { name, from, to } = node;

        // ── Bold ─────────────────────────────────────────────────────────────
        if (name === 'StrongEmphasis') {
          if (sel.from <= to && sel.to >= from) return false;
          raw.push(Decoration.replace({}).range(from, from + 2));
          if (to - from > 4)
            raw.push(Decoration.mark({ class: 'cm-md-strong' }).range(from + 2, to - 2));
          raw.push(Decoration.replace({}).range(to - 2, to));
          return false;
        }

        // ── Italic ───────────────────────────────────────────────────────────
        if (name === 'Emphasis') {
          if (sel.from <= to && sel.to >= from) return false;
          raw.push(Decoration.replace({}).range(from, from + 1));
          if (to - from > 2)
            raw.push(Decoration.mark({ class: 'cm-md-em' }).range(from + 1, to - 1));
          raw.push(Decoration.replace({}).range(to - 1, to));
          return false;
        }

        // ── Headings ─────────────────────────────────────────────────────────
        if (
          name === 'ATXHeading1' || name === 'ATXHeading2' || name === 'ATXHeading3' ||
          name === 'ATXHeading4' || name === 'ATXHeading5' || name === 'ATXHeading6'
        ) {
          if (sameLineAsCursor(state, sel.from, from)) return false;
          const level = parseInt(name.slice(-1), 10);
          const markerLen = level + 1; // `###` + one space
          const contentStart = from + markerLen;
          if (contentStart < to) {
            raw.push(Decoration.replace({}).range(from, contentStart));
            raw.push(Decoration.mark({ class: `cm-md-h${level}` }).range(contentStart, to));
          }
          return false;
        }

        // ── List items ───────────────────────────────────────────────────────
        if (name === 'ListItem') {
          if (sameLineAsCursor(state, sel.from, from)) return; // reveal on cursor line
          const hasTask = node.node.getChild('Task') !== null;
          if (hasTask) {
            // Just hide `- ` — checkbox comes from TaskMarker handler
            raw.push(Decoration.replace({}).range(from, from + 2));
          } else {
            raw.push(
              Decoration.replace({ widget: new BulletWidget() }).range(from, from + 2),
            );
          }
          return; // allow children (TaskMarker) to be visited
        }

        // ── Checkboxes ───────────────────────────────────────────────────────
        if (name === 'TaskMarker') {
          if (sameLineAsCursor(state, sel.from, from)) return false;
          const text = state.doc.sliceString(from, to);
          const checked = text.toLowerCase() !== '[ ]';
          raw.push(
            Decoration.replace({ widget: new CheckboxWidget(checked, from) }).range(from, to),
          );
          return false;
        }

        // ── Inline code ──────────────────────────────────────────────────────
        if (name === 'InlineCode') {
          if (sel.from <= to && sel.to >= from) return false;
          raw.push(Decoration.mark({ class: 'cm-md-code' }).range(from, to));
          return false;
        }

        // ── Fenced code block — apply line deco to each line for monospace + bg ──
        if (name === 'FencedCode') {
          const doc = state.doc;
          let pos = from;
          while (pos <= to) {
            const line = doc.lineAt(pos);
            raw.push(Decoration.line({ class: 'cm-md-fenced-line' }).range(line.from));
            pos = line.to + 1;
          }
          return false;
        }

        // ── Links ────────────────────────────────────────────────────────────
        if (name === 'Link') {
          if (sel.from <= to && sel.to >= from) return false;
          // Walk children to find the closing `]` position
          let textEnd = to;
          const c = node.node.cursor();
          if (c.firstChild()) {
            do {
              if (c.name === 'LinkMark' && state.doc.sliceString(c.from, c.to) === ']') {
                textEnd = c.from;
                break;
              }
            } while (c.nextSibling());
          }
          raw.push(Decoration.replace({}).range(from, from + 1)); // hide `[`
          if (from + 1 < textEnd)
            raw.push(Decoration.mark({ class: 'cm-md-link' }).range(from + 1, textEnd));
          raw.push(Decoration.replace({}).range(textEnd, to)); // hide `](url)`
          return false;
        }

        // ── Tables ───────────────────────────────────────────────────────────
        if (name === 'Table') {
          const doc = state.doc;
          let pos = from;
          while (pos <= to) {
            const line = doc.lineAt(pos);
            const text = line.text.trim();
            const cursorOnLine = state.doc.lineAt(sel.from).number === line.number;
            if (/^\|?[\s\-:|]+\|?$/.test(text) && text.includes('---') && !cursorOnLine) {
              raw.push(Decoration.replace({}).range(line.from, Math.min(line.to, to)));
            } else {
              raw.push(Decoration.line({ class: 'cm-md-table-line' }).range(line.from));
            }
            pos = line.to + 1;
          }
          return false;
        }
        if (name === 'TableDelimiter') {
          raw.push(Decoration.replace({}).range(from, to));
          return false;
        }
        if (name === 'TableCell') {
          const parent = node.node.parent;
          if (parent?.name === 'TableHeader') {
            raw.push(Decoration.mark({ class: 'cm-md-table-header-cell' }).range(from, to));
          } else if (parent?.name === 'TableRow') {
            raw.push(Decoration.mark({ class: 'cm-md-table-cell' }).range(from, to));
          }
          return false;
        }
      },
    });
  }

  // Sort by from, then by decoration priority (replace before mark at same pos)
  raw.sort((a, b) => a.from !== b.from ? a.from - b.from : a.value.startSide - b.value.startSide);

  const builder = new RangeSetBuilder<Decoration>();
  for (const r of raw) builder.add(r.from, r.to, r.value);
  return builder.finish();
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

class MarkdownLivePreviewPlugin {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet || update.viewportChanged) {
      this.decorations = buildDecorations(update.view);
    }
  }
}

export function markdownLivePreview(): Extension {
  return ViewPlugin.fromClass(MarkdownLivePreviewPlugin, {
    decorations: (v) => v.decorations,
  });
}
