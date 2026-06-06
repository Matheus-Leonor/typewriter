import { useCallback, useEffect, useRef, useState } from 'react';

/* ============================================================================
   RadialMenu — Quick Menu radial, inspirado em menus de jogos (LoL / Arc).
   Aberto por atalho global de qualquer lugar; a mira segue o cursor, clique
   (ou Enter no item mirado) executa, Esc / clique no scrim fecha.
   Geometria e estilo (.rad-*) portados do caret · Island design system.
   ========================================================================== */

export interface RadialItem {
  icon: string;       // nome do Material Symbol
  label: string;
  onRun: () => void;
}

interface Props {
  items: RadialItem[];
  open: boolean;
  onClose: () => void;
  triggerKey?: string; // exibido no hub (ex.: "Ctrl K")
}

// geometria do anel (viewBox 380x380)
const C = 190, Ritem = 132, ri = 66, ro = 178, Rcursor = 150;

export function RadialMenu({ items, open, onClose, triggerKey = 'Ctrl K' }: Props) {
  const [aim, setAim] = useState(-1);
  const stageRef = useRef<HTMLDivElement>(null);
  const center = useRef({ x: 0, y: 0 });

  const ang = useCallback(
    (i: number) => ((-90 + i * (360 / items.length)) * Math.PI) / 180,
    [items.length],
  );
  const pt = (a: number, r: number): [number, number] => [C + r * Math.cos(a), C + r * Math.sin(a)];

  // recalcula o centro do stage sempre que abre
  useEffect(() => {
    if (!open) { setAim(-1); return; }
    const r = stageRef.current?.getBoundingClientRect();
    if (r) center.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, [open]);

  // mira segue o ponteiro
  useEffect(() => {
    if (!open) return;
    const onMove = (e: MouseEvent) => {
      const { x, y } = center.current;
      const dx = e.clientX - x, dy = e.clientY - y;
      if (Math.hypot(dx, dy) < 38) { setAim(-1); return; } // dead zone = hub
      let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      if (deg < 0) deg += 360;
      const step = 360 / items.length;
      setAim(Math.round(deg / step) % items.length);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [open, items.length]);

  const run = useCallback(
    (i: number) => {
      if (i < 0 || i >= items.length) return;
      onClose();
      items[i].onRun();
    },
    [items, onClose],
  );

  // teclado: Esc fecha, Enter executa o item mirado
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'Enter' && aim >= 0) { e.preventDefault(); run(aim); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, aim, run, onClose]);

  if (!open) return null;

  const aimed = aim >= 0;
  let sector: string | null = null;
  let needle: [number, number] | null = null;
  let cursor: [number, number] | null = null;
  if (aimed) {
    const a0 = ang(aim) - Math.PI / items.length;
    const a1 = ang(aim) + Math.PI / items.length;
    const [ox0, oy0] = pt(a0, ro), [ox1, oy1] = pt(a1, ro);
    const [ix1, iy1] = pt(a1, ri), [ix0, iy0] = pt(a0, ri);
    sector = `M ${ox0} ${oy0} A ${ro} ${ro} 0 0 1 ${ox1} ${oy1} L ${ix1} ${iy1} A ${ri} ${ri} 0 0 0 ${ix0} ${iy0} Z`;
    needle = pt(ang(aim), Ritem - 22);
    cursor = pt(ang(aim), Rcursor);
  }

  return (
    <div className="rad-overlay" onClick={onClose}>
      <div className="rad-stage" ref={stageRef} onClick={(e) => e.stopPropagation()}>
        <svg className="rad-svg" viewBox="0 0 380 380">
          <circle className="rad-ring-bg" cx={C} cy={C} r={ro} />
          <circle className="rad-ring-bg" cx={C} cy={C} r={ri} />
          {sector && <path className="rad-sector" d={sector} />}
          {needle && <line className="rad-needle" x1={C} y1={C} x2={needle[0]} y2={needle[1]} />}
        </svg>

        {items.map((it, i) => {
          const [x, y] = pt(ang(i), Ritem);
          return (
            <div
              key={it.label}
              className={'rad-item' + (i === aim ? ' on' : '')}
              style={{ left: x, top: y, cursor: 'pointer' }}
              onMouseEnter={() => setAim(i)}
              onClick={() => run(i)}
            >
              <div className="disc">
                <span className="material-symbols-outlined">{it.icon}</span>
              </div>
              <div className="cap">{it.label}</div>
            </div>
          );
        })}

        <div className="rad-hub">
          <span className="key">{triggerKey}</span>
          <span className="label">{aimed ? items[aim].label : 'Quick Menu'}</span>
          <span className="hint">mire · clique para executar</span>
        </div>

        {cursor && <div className="rad-cursor" style={{ left: cursor[0], top: cursor[1] }} />}
      </div>
    </div>
  );
}
