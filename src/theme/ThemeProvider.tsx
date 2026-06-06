import { createContext, useContext, useEffect, useState } from 'react';
import { tokens, Theme } from './tokens';
import { db } from '../db';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
});

function applyTheme(theme: Theme) {
  const t = tokens[theme];
  const root = document.documentElement;
  const set = (k: string, v: string) => root.style.setProperty(k, v);

  root.setAttribute('data-theme', theme);
  // Make native controls (select option lists, scrollbars) follow the theme.
  set('color-scheme', theme);

  // ── DS Island vars (consumidas por island.css: .is-* / .cx-* / .rad-*) ────
  set('--backdrop', t.backdrop);
  set('--bg', t.bg);
  set('--surface', t.surface);
  set('--surface-2', t.surface2);
  set('--elevated', t.elevated);
  set('--hair', t.hair);
  set('--hair-2', t.hair2);
  set('--overlay', t.overlay);
  set('--ink', t.ink);
  set('--ink-2', t.ink2);
  set('--ink-3', t.ink3);
  set('--ink-4', t.ink4);
  set('--accent', t.accent);
  set('--accent-h', t.accentH);
  set('--accent-d', t.accentD);
  set('--accent-bg', t.accentBg);
  set('--accent-bd', t.accentBd);
  set('--shadow-island', t.shadowIsland);
  set('--shadow-menu', t.shadowMenu);

  // ── bridge: aliases legados usados pelos componentes existentes ──────────
  set('--bg-primary', t.bg);
  set('--bg-surface', t.surface);
  set('--bg-overlay', t.overlaySubtle);
  // ── frame vs ilha (Islands JetBrains): o app/frame e o "mar" (backdrop);
  //    o conteudo flutua como ilha (surface). TopBar/Sidebar usam --bg-app;
  //    editor/terminal/preview usam --bg-island. ─────────────────────────────
  set('--bg-app', t.backdrop);
  set('--bg-island', t.surface);
  set('--text-primary', t.ink);
  set('--text-secondary', t.ink2);
  set('--text-muted', t.ink3);
  set('--border', t.hair);
  set('--accent-muted', t.accentBg);
  set('--selection-bg', t.selection);

  // Fontes: Geist (UI/editor) + Geist Mono (codigo). Definidas estaticamente
  // em global.css :root; o editor pode ser sobrescrito em runtime.
}

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const sys = getSystemTheme();
    applyTheme(sys);
    return sys;
  });

  useEffect(() => {
    db.settings.get('theme').then((saved) => {
      if (saved === 'light' || saved === 'dark') {
        setTheme(saved);
        applyTheme(saved);
      }
    });
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
    db.settings.set('theme', next);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
