import { Extension } from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view';
import { initSparkCanvas, spawnSpark, SparkTrigger } from '../../engine/effects/spark';

const reducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ─── Per-char materialise (blur 3px → 0, 80ms normal / 50ms sprint) ─────────

// Shared speed state — updated by keydown handler, read by CharFadeInPlugin
type SharedSpeed = { wpm: number };

function makeCharFadeInPlugin(speed: SharedSpeed) {
  class CharFadeInPlugin {
    decorations: DecorationSet = Decoration.none;

    update(update: ViewUpdate) {
      if (!update.docChanged) {
        this.decorations = this.decorations.map(update.changes);
        return;
      }
      if (reducedMotion) { this.decorations = Decoration.none; return; }

      let lastInsertTo = -1;
      update.changes.iterChanges((_fA, _tA, fromB, toB, inserted) => {
        if (inserted.length > 0 && toB > fromB) lastInsertTo = toB;
      });

      if (lastInsertTo > 0) {
        const cls = speed.wpm > 100
          ? 'kinetic-char-new-sprint'
          : 'kinetic-char-new';
        this.decorations = Decoration.set([
          Decoration.mark({ class: cls }).range(lastInsertTo - 1, lastInsertTo),
        ]);
      } else {
        this.decorations = Decoration.none;
      }
    }
  }
  return ViewPlugin.fromClass(CharFadeInPlugin, {
    decorations: (v) => v.decorations,
  });
}

// ─── Spark (monochrome) ───────────────────────────────────────────────────────

function getParticleColor(): string {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return isDark ? '#EDEDEB' : '#1A1A1A';
}

// ─── Main extension factory ───────────────────────────────────────────────────

export function kineticExtension(): Extension {
  const sparkCanvas = initSparkCanvas();
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let isHeld = false;

  // Speed tracking for sprint-aware charIn duration
  const speed: SharedSpeed = { wpm: 0 };
  let keyTimes: number[] = [];
  let speedIdleTimer: ReturnType<typeof setTimeout> | null = null;

  return [
    // 1. Per-char materialise (blur → clear, sprint-aware duration)
    makeCharFadeInPlugin(speed),

    // 2. Text-reactive: spark
    ViewPlugin.define(() => ({
      update(update: ViewUpdate) {
        if (!update.docChanged || reducedMotion) return;
        const view = update.view;
        const head = view.state.selection.main.head;

        // Spark at sentence-ending punctuation + space
        if (head >= 2) {
          const before = view.state.sliceDoc(Math.max(0, head - 2), head);
          const [c1, c2] = [before[0] ?? '', before[1] ?? ''];
          let trigger: SparkTrigger | null = null;
          if (c2 === ' ' && (c1 === '.' || c1 === '!' || c1 === '?')) {
            trigger = c1 as SparkTrigger;
          }
          if (trigger) {
            const coords = view.coordsAtPos(head - 1);
            if (coords) {
              const color = getParticleColor();
              spawnSpark(sparkCanvas, coords.left, coords.top, trigger, color);
            }
          }
        }

        // Enter spark
        let hasNewline = false;
        update.transactions.forEach((tr) => {
          if (!tr.docChanged) return;
          tr.changes.iterChanges((_fA, _tA, _fB, _tB, ins) => {
            if (ins.toString().includes('\n')) hasNewline = true;
          });
        });
        if (hasNewline) {
          const coords = view.coordsAtPos(head);
          if (coords) {
            spawnSpark(sparkCanvas, coords.left, coords.top, 'enter', getParticleColor());
          }
        }
      },
    })),

    // 3. Keyboard: cursor pulse + backspace
    EditorView.domEventHandlers({
      keydown(e, view) {
        if (e.isComposing) return false;

        // Track WPM for sprint-aware charIn
        const now = Date.now();
        keyTimes.push(now);
        keyTimes = keyTimes.filter((t) => t >= now - 5000);
        speed.wpm = Math.round(keyTimes.length / 5 / (5000 / 60000));
        if (speedIdleTimer) clearTimeout(speedIdleTimer);
        speedIdleTimer = setTimeout(() => { keyTimes = []; speed.wpm = 0; }, 3000);

        // Cursor pulse: force opacity 1 while typing, then resume blink after idle.
        if (!reducedMotion) {
          const typingTimer = Number(view.dom.dataset.typingTimer || 0);
          if (typingTimer) window.clearTimeout(typingTimer);
          view.dom.classList.add('typing-active');
          view.dom.dataset.typingTimer = String(window.setTimeout(() => {
            view.dom.classList.remove('typing-active');
            delete view.dom.dataset.typingTimer;
          }, 800));

          const cursor = view.dom.querySelector('.cm-cursor') as HTMLElement | null;
          if (cursor) {
            cursor.classList.add('cm-cursor-active');
            setTimeout(() => cursor.classList.remove('cm-cursor-active'), 80);
          }
        }

        // Backspace opacity/blur on the editor shell
        if (e.key === 'Backspace') {
          const shell = view.dom.closest('.ds-editor') as HTMLElement | null;
          if (shell) {
            if (e.ctrlKey || e.metaKey) {
              shell.style.transition = 'opacity 80ms ease-out';
              shell.style.opacity = '0.7';
              setTimeout(() => { shell.style.opacity = '1'; }, 80);
            } else if (!isHeld && !holdTimer) {
              shell.style.transition = 'opacity 60ms ease-out';
              shell.style.opacity = '0.85';
              setTimeout(() => {
                shell.style.transition = 'opacity 60ms ease-in';
                shell.style.opacity = '1';
              }, 60);
              holdTimer = setTimeout(() => {
                isHeld = true;
                if (shell) {
                  shell.style.transition = 'filter 60ms ease-out';
                  shell.style.filter = 'blur(1px)';
                }
              }, 300);
            }
          }
        }
        return false;
      },

      keyup(e, view) {
        if (e.key !== 'Backspace') return false;
        if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
        if (isHeld) {
          const shell = view.dom.closest('.ds-editor') as HTMLElement | null;
          if (shell) {
            shell.style.transition = 'filter 120ms ease-out';
            shell.style.filter = 'none';
          }
          isHeld = false;
        }
        return false;
      },
    }),
  ];
}
