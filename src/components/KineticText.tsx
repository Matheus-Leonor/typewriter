import { useMemo, useState } from 'react';

interface KineticTextProps {
  text: string;
  baseWeight?: number;
  peakWeight?: number;
  radius?: number;
}

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function KineticText({
  text,
  baseWeight = 400,
  peakWeight = 580,
  radius = 3,
}: KineticTextProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chars = useMemo(() => Array.from(text), [text]);
  const disabled = reducedMotion();

  return (
    <span onMouseLeave={() => setHoverIndex(null)} aria-label={text}>
      {chars.map((char, index) => {
        const distance = hoverIndex === null ? Infinity : Math.abs(index - hoverIndex);
        const influence = disabled || distance > radius ? 0 : 1 - distance / (radius + 1);
        const weight = Math.round(baseWeight + (peakWeight - baseWeight) * influence);

        return (
          <span
            key={`${char}-${index}`}
            aria-hidden="true"
            onMouseEnter={() => setHoverIndex(index)}
            style={{
              display: 'inline-block',
              fontVariationSettings: `'wght' ${weight}`,
              fontWeight: weight,
              transition: hoverIndex === null ? 'font-weight 300ms ease-out, font-variation-settings 300ms ease-out' : 'font-weight 120ms ease-out, font-variation-settings 120ms ease-out',
            }}
          >
            {char === ' ' ? '\u00a0' : char}
          </span>
        );
      })}
    </span>
  );
}
