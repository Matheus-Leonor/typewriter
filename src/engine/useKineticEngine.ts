import { useCallback, useEffect, useRef } from 'react';
import { useTypingSpeed } from './useTypingSpeed';
import { applyTremor } from './effects/tremor';
import { initSparkCanvas, spawnSpark, SparkTrigger } from './effects/spark';
import { watchBackspace } from './effects/backspace';
import { useFlowState, FlowState } from './effects/flow';

export function useKineticEngine(
  editorRef: React.RefObject<HTMLElement>,
  getValue: () => string,
  enabled = true,
): FlowState {
  const { level, isIdle } = useTypingSpeed();
  const flowState = useFlowState(level, isIdle);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize spark canvas once
  useEffect(() => {
    if (!enabled) return;
    canvasRef.current = initSparkCanvas();
  }, [enabled]);

  // Tremor on each keypress
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled || !editorRef.current) return;

      const el = editorRef.current;

      // Tremor
      applyTremor(el, level);

      // Spark triggers
      const value = getValue();
      if (!canvasRef.current) return;
      const key = e.key;
      if ((key === ' ' || key === 'Enter') && value.length >= 2) {
        const prev = value[value.length - 2] ?? '';
        let trigger: SparkTrigger | null = null;
        if (prev === '.') trigger = '.';
        else if (prev === '!') trigger = '!';
        else if (prev === '?') trigger = '?';

        if (trigger && editorRef.current) {
          const rect = editorRef.current.getBoundingClientRect();
          spawnSpark(canvasRef.current, rect.left + rect.width / 2, rect.top + 20, trigger);
        }
      }

      if (key === 'Enter' && canvasRef.current && editorRef.current) {
        const rect = editorRef.current.getBoundingClientRect();
        spawnSpark(canvasRef.current, rect.left + rect.width / 2, rect.top + 20, 'enter');
      }
    },
    [enabled, editorRef, level, getValue],
  );

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, onKey]);

  // Backspace watcher
  useEffect(() => {
    if (!enabled || !editorRef.current) return;
    return watchBackspace(editorRef.current);
  }, [enabled, editorRef]);

  return flowState;
}
