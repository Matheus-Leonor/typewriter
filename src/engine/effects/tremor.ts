import { SpeedLevel } from '../useTypingSpeed';

interface TremorConfig {
  magnitude: number;
  frames: number;
  intervalMs: number;
}

const CONFIGS: Partial<Record<SpeedLevel, TremorConfig>> = {
  2: { magnitude: 0.4, frames: 3, intervalMs: 32 },
  3: { magnitude: 0.7, frames: 4, intervalMs: 30 },
  4: { magnitude: 1.1, frames: 5, intervalMs: 28 },
};

export function applyTremor(element: HTMLElement, level: SpeedLevel): void {
  const cfg = CONFIGS[level];
  if (!cfg) return;

  const { magnitude, frames, intervalMs } = cfg;
  let frame = 0;

  // Bias distribution toward smaller values (square the uniform random)
  function biasedRand() {
    const r = Math.random() * 2 - 1;
    return Math.sign(r) * r * r * magnitude;
  }

  const tick = () => {
    if (frame >= frames) {
      element.style.transform = 'translate(0,0)';
      return;
    }
    element.style.transform = `translate(${biasedRand()}px, ${biasedRand()}px)`;
    frame++;
    setTimeout(tick, intervalMs);
  };

  tick();
}
