export const tokens = {
  light: {
    bg: {
      primary: '#FFFFFF',
      surface: '#F7F7F5',
      overlay: 'rgba(0,0,0,0.04)',
    },
    text: {
      primary: '#1A1A1A',
      secondary: '#5A5A57',
      muted: '#8A8A85',
    },
    border: 'rgba(0,0,0,0.08)',
    accent: '#2A2A28',
    accentMuted: 'rgba(0,0,0,0.07)',
    selection: 'rgba(0,0,0,0.13)',
    font: {
      ui: '"IBM Plex Sans", sans-serif',
      mono: '"JetBrains Mono", monospace',
      editor: '"Inter", sans-serif',
    },
  },
  dark: {
    bg: {
      primary: '#111110',
      surface: '#1A1A19',
      overlay: 'rgba(255,255,255,0.04)',
    },
    text: {
      primary: '#EDEDEB',
      secondary: '#9A9A97',
      muted: '#5A5A57',
    },
    border: 'rgba(255,255,255,0.08)',
    accent: '#C4C4C0',
    accentMuted: 'rgba(255,255,255,0.07)',
    selection: 'rgba(255,255,255,0.12)',
    font: {
      ui: '"IBM Plex Sans", sans-serif',
      mono: '"JetBrains Mono", monospace',
      editor: '"Inter", sans-serif',
    },
  },
} as const;

export type Theme = keyof typeof tokens;
