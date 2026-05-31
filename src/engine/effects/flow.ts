import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { SpeedLevel } from '../useTypingSpeed';

export interface FlowState {
  isFlow: boolean;
  flowProgress: number; // 0–1, progress toward entering flow
}

export const FlowContext = createContext<FlowState>({ isFlow: false, flowProgress: 0 });

export function useFlowContext() {
  return useContext(FlowContext);
}

const FLOW_ENTRY_MS = 90_000;  // 90 seconds at level >= 2
const FLOW_EXIT_IDLE_MS = 8_000;
const FLOW_EXIT_LEVEL_MS = 5_000;

export function useFlowState(level: SpeedLevel, isIdle: boolean): FlowState {
  const [isFlow, setIsFlow] = useState(false);
  const [flowProgress, setFlowProgress] = useState(0);

  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const exitLevelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isFlow) {
      // Exit conditions
      if (isIdle) {
        exitLevelTimerRef.current = setTimeout(() => {
          setIsFlow(false);
          setFlowProgress(0);
        }, FLOW_EXIT_IDLE_MS);
      } else if (level < 2) {
        exitLevelTimerRef.current = setTimeout(() => {
          setIsFlow(false);
          setFlowProgress(0);
        }, FLOW_EXIT_LEVEL_MS);
      } else {
        if (exitLevelTimerRef.current) clearTimeout(exitLevelTimerRef.current);
      }
      return;
    }

    // Entry logic
    if (level < 2 || isIdle) {
      if (startRef.current !== null) {
        startRef.current = null;
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setFlowProgress(0);
      return;
    }

    if (startRef.current === null) {
      startRef.current = Date.now();
    }

    const tick = () => {
      if (!startRef.current) return;
      const elapsed = Date.now() - startRef.current;
      const progress = Math.min(elapsed / FLOW_ENTRY_MS, 1);
      setFlowProgress(progress);
      if (progress >= 1) {
        setIsFlow(true);
        startRef.current = null;
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [level, isIdle, isFlow]);

  // Apply/remove flow UI classes
  useEffect(() => {
    const root = document.documentElement;
    if (isFlow) {
      root.classList.add('flow-active');
    } else {
      root.classList.remove('flow-active');
    }
  }, [isFlow]);

  return { isFlow, flowProgress };
}

// CSS for flow state (injected via global.css or a style tag)
export const FLOW_CSS = `
html.flow-active .ds-status-bar {
  transition: opacity 2s ease;
  opacity: 0.2;
}
html.flow-active .ds-sidebar {
  transition: opacity 2s ease;
  opacity: 0.1;
}
html.flow-active .ds-editor {
  transition: border-color 2s ease, box-shadow 2s ease;
  border-color: transparent;
  box-shadow: 0 0 0 1px var(--accent-muted);
}
html:not(.flow-active) .ds-status-bar,
html:not(.flow-active) .ds-sidebar {
  transition: opacity 1.5s ease-in;
  opacity: 1;
}
`;
