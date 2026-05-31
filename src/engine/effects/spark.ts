export type SparkTrigger = '.' | '!' | '?' | 'enter';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  decay: number;
  color: string;
}

const TRIGGER_COUNTS: Record<SparkTrigger, number> = {
  '.': 4,
  '!': 5,
  '?': 4,
  enter: 7,
};

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let particles: Particle[] = [];
let rafId: number | null = null;

export function initSparkCanvas(): HTMLCanvasElement {
  if (canvas) return canvas;

  canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:9999;';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');

  window.addEventListener('resize', () => {
    if (canvas) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
  });

  return canvas;
}

function loop() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  particles = particles.filter((p) => p.life > 0);

  for (const p of particles) {
    p.vy += 0.08;
    p.x += p.vx;
    p.y += p.vy;
    p.life -= p.decay;

    const alpha = p.life * p.life; // quadratic fade
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;

  if (particles.length > 0) {
    rafId = requestAnimationFrame(loop);
  } else {
    rafId = null;
  }
}

/** color defaults to the current theme's --text-primary */
export function spawnSpark(
  canvasEl: HTMLCanvasElement,
  x: number,
  y: number,
  trigger: SparkTrigger,
  color?: string,
): void {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');

  const resolvedColor =
    color ??
    (document.documentElement.getAttribute('data-theme') === 'dark'
      ? '#EDEDEB'
      : '#1A1A1A');

  const count = TRIGGER_COUNTS[trigger];

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.8 + Math.random() * 1.2;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      radius: 1.5 + Math.random() * 0.5,
      life: 1.0,
      decay: 0.05 + Math.random() * 0.03,
      color: resolvedColor,
    });
  }

  if (!rafId) rafId = requestAnimationFrame(loop);
}
