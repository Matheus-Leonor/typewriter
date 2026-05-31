import { useEffect, useRef } from 'react';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

interface ScrambleTitleProps {
  text: string;
  animate?: boolean;
  duration?: number;
}

function shouldReduceMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function ScrambleTitle({ text, animate = true, duration = 400 }: ScrambleTitleProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const previousTextRef = useRef(text);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);

    const previousText = previousTextRef.current;
    previousTextRef.current = text;

    if (!animate || previousText === text || shouldReduceMotion()) {
      element.textContent = text;
      return;
    }

    const frames = Math.max(1, Math.floor(duration / 16));
    let frame = 0;

    const tick = () => {
      const progress = frame / frames;
      const resolved = Math.floor(progress * text.length * 1.3);
      element.textContent = Array.from(text)
        .map((char, index) => {
          if (index < resolved || char === ' ') return char;
          return CHARS[Math.floor(Math.random() * CHARS.length)];
        })
        .join('');

      frame++;
      if (frame <= frames) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        element.textContent = text;
        frameRef.current = null;
      }
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [animate, duration, text]);

  return <span ref={ref}>{text}</span>;
}
