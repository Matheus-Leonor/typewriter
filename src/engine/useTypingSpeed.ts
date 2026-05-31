import { useCallback, useEffect, useRef, useState } from 'react';

export type SpeedLevel = 0 | 1 | 2 | 3 | 4;

export interface TypingSpeed {
  wpm: number;
  level: SpeedLevel;
  isIdle: boolean;
}

const WINDOW_MS = 5000;
const IDLE_TIMEOUT_MS = 3000;

function wpmToLevel(wpm: number): SpeedLevel {
  if (wpm >= 105) return 4;
  if (wpm >= 75) return 3;
  if (wpm >= 45) return 2;
  if (wpm >= 15) return 1;
  return 0;
}

export function useTypingSpeed(): TypingSpeed {
  const keyTimesRef = useRef<number[]>([]);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [speed, setSpeed] = useState<TypingSpeed>({ wpm: 0, level: 0, isIdle: true });

  const onKeyDown = useCallback(() => {
    const now = Date.now();
    keyTimesRef.current.push(now);
    const cutoff = now - WINDOW_MS;
    keyTimesRef.current = keyTimesRef.current.filter((t) => t >= cutoff);

    const wpm = Math.round(keyTimesRef.current.length / 5 / (WINDOW_MS / 60000));
    const level = wpmToLevel(wpm);

    // Gate setState — only re-render when level or isIdle actually changes
    setSpeed((prev) => {
      if (prev.level === level && !prev.isIdle) return prev;
      return { wpm, level, isIdle: false };
    });

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      keyTimesRef.current = [];
      setSpeed({ wpm: 0, level: 0, isIdle: true });
    }, IDLE_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [onKeyDown]);

  return speed;
}
