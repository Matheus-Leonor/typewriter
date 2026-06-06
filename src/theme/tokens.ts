/* ============================================================================
   TypeWriter — Design Tokens (Island / Blue)
   Identidade extraida do "caret · Island" design system: paineis flutuantes
   arredondados sobre um backdrop quase preto, acento azul eletrico, chrome
   minimalista de 1px. O dark e a identidade canonica; o light e derivado.

   Centralizacao: este arquivo e a UNICA fonte das cores dependentes de tema.
   ThemeProvider.applyTheme() mapeia cada valor para as CSS vars do DS
   (--backdrop, --surface, --ink, --accent, ...) e tambem para os aliases
   legados (--bg-primary, --text-primary, ...) usados pelos componentes
   existentes. Valores estaticos (raios, gaps, sombras, sintaxe, fontes) ficam
   em global.css :root.
   ========================================================================== */

export const tokens = {
  dark: {
    // ── surfaces: ilhas ESCURAS flutuam sobre um "mar" mais CLARO ───────────
    //    (T-75) Invertido em relacao ao DS canonico: o backdrop (borda/mar
    //    entre as ilhas) e um passo mais claro que a superficie das ilhas, que
    //    sao o ponto mais escuro. surface-2/elevated continuam subindo a
    //    elevacao DENTRO da ilha (hover, inputs, abas ativas).
    backdrop: '#1a1c22',
    bg: '#0a0b0e',
    surface: '#0d0e12',
    surface2: '#15161d',
    elevated: '#1e2129',
    hair: 'rgba(255,255,255,0.07)',
    hair2: 'rgba(255,255,255,0.04)',
    overlay: 'rgba(6,7,10,0.55)', // scrim do quick menu
    // ── ink ─────────────────────────────────────────────────────────────────
    ink: '#ededf0',
    ink2: '#9b9ba6',
    ink3: '#6c6c77',
    ink4: '#45454e',
    // ── acento azul eletrico ─────────────────────────────────────────────────
    accent: '#3d8bfd',
    accentH: '#62a4ff',
    accentD: '#2f6fe0',
    accentBg: 'rgba(61,139,253,0.13)',
    accentBd: 'rgba(61,139,253,0.36)',
    // ── legado: tint sutil (hover/input/code inline) ─────────────────────────
    overlaySubtle: 'rgba(255,255,255,0.04)',
    selection: 'rgba(255,255,255,0.13)',
    // ── elevacao (sombras profundas sobre backdrop quase preto) ─────────────
    shadowIsland: '0 8px 28px rgba(0,0,0,0.35)',
    shadowMenu: '0 20px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)',
  },
  light: {
    // Island claro derivado: superficies claras, mesmo acento azul. O backdrop
    // e nitidamente mais escuro que a superficie para que as ilhas "flutuem".
    backdrop: '#c9ccd6',
    bg: '#ffffff',
    surface: '#fbfbfd',
    surface2: '#f0f1f5',
    elevated: '#e7e8ee',
    hair: 'rgba(0,0,0,0.12)',
    hair2: 'rgba(0,0,0,0.06)',
    overlay: 'rgba(201,204,214,0.6)',
    ink: '#1a1a1f',
    ink2: '#55555f',
    ink3: '#83838d',
    ink4: '#aaaab4',
    accent: '#2f6fe0',
    accentH: '#3d8bfd',
    accentD: '#2558c4',
    accentBg: 'rgba(47,111,224,0.12)',
    accentBd: 'rgba(47,111,224,0.40)',
    overlaySubtle: 'rgba(0,0,0,0.04)',
    selection: 'rgba(0,0,0,0.12)',
    // ── elevacao (sombras suaves/claras, evitam aspecto "lamacento") ────────
    shadowIsland: '0 6px 18px rgba(40,44,60,0.12)',
    shadowMenu: '0 16px 44px rgba(40,44,60,0.22), inset 0 1px 0 rgba(255,255,255,0.5)',
  },
} as const;

export type Theme = keyof typeof tokens;
