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
  root.setAttribute('data-theme', theme);
  root.style.setProperty('--bg-primary', t.bg.primary);
  root.style.setProperty('--bg-surface', t.bg.surface);
  root.style.setProperty('--bg-overlay', t.bg.overlay);
  root.style.setProperty('--text-primary', t.text.primary);
  root.style.setProperty('--text-secondary', t.text.secondary);
  root.style.setProperty('--text-muted', t.text.muted);
  root.style.setProperty('--border', t.border);
  root.style.setProperty('--accent', t.accent);
  root.style.setProperty('--accent-muted', t.accentMuted);
  root.style.setProperty('--selection-bg', t.selection);
  root.style.setProperty('--font-ui', t.font.ui);
  root.style.setProperty('--font-mono', t.font.mono);
  root.style.setProperty('--font-editor', t.font.editor);
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
