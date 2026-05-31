export interface RepeatInfo {
  char: string;
  count: number;
}

export function detectRepeat(value: string): RepeatInfo | null {
  if (value.length < 3) return null;
  const last = value[value.length - 1];
  let count = 1;
  for (let i = value.length - 2; i >= 0; i--) {
    if (value[i] === last) count++;
    else break;
  }
  return count >= 3 ? { char: last, count } : null;
}

interface RepeatStyle {
  fontWeight: number;
  letterSpacing: string;
  duration: number;
}

function getStyle(count: number): RepeatStyle {
  if (count >= 6) return { fontWeight: 580, letterSpacing: '1.0px', duration: 80 };
  if (count === 5) return { fontWeight: 550, letterSpacing: '0.7px', duration: 80 };
  if (count === 4) return { fontWeight: 500, letterSpacing: '0.4px', duration: 80 };
  return { fontWeight: 450, letterSpacing: '0.2px', duration: 80 };
}

let dotPulseInterval: ReturnType<typeof setInterval> | null = null;

export function applyRepeatEffect(element: HTMLElement, repeat: RepeatInfo): void {
  const { char, count } = repeat;

  if (char === '.' && count >= 3) {
    if (!dotPulseInterval) {
      let opacity = 0.9;
      let dir = -1;
      dotPulseInterval = setInterval(() => {
        opacity += dir * 0.08;
        if (opacity <= 0.5) dir = 1;
        if (opacity >= 0.9) dir = -1;
        element.style.opacity = String(opacity);
      }, 50);
    }
    return;
  }

  if (dotPulseInterval) {
    clearInterval(dotPulseInterval);
    dotPulseInterval = null;
    element.style.opacity = '1';
  }

  if (char === '!' && count >= 3) {
    const scale = Math.min(1.04, 1.0 + (count - 3) * 0.01);
    element.style.transition = 'transform 60ms ease-out';
    element.style.transform = `scale(${scale})`;
    return;
  }

  // Default: density shift (no scale, no font-size change)
  const s = getStyle(count);
  element.style.transition = `font-weight ${s.duration}ms ease-out, letter-spacing ${s.duration}ms ease-out`;
  element.style.fontWeight = String(s.fontWeight);
  element.style.letterSpacing = s.letterSpacing;
}

export function clearRepeatEffect(element: HTMLElement): void {
  if (dotPulseInterval) {
    clearInterval(dotPulseInterval);
    dotPulseInterval = null;
  }
  element.style.transition = 'font-weight 400ms ease-out, letter-spacing 400ms ease-out, opacity 400ms ease-out, transform 400ms ease-out';
  element.style.fontWeight = '400';
  element.style.letterSpacing = '0px';
  element.style.opacity = '1';
  element.style.transform = '';
}
