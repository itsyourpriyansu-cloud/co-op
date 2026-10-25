// Light/dark mode for the console + the Blend ThemeProvider fed by our single token source.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SnackbarV2, SnackbarV2Position, Theme, ThemeProvider, type ComponentTokenOverrides, type ThemeType } from '@juspay/blend-design-system';
import { createBlendFoundation } from '@tgs/design-tokens';

type Mode = 'light' | 'dark';
const KEY = 'tgs.console.theme';

const ModeContext = createContext<{ mode: Mode; toggle: () => void } | null>(null);

function initialMode(): Mode {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Blend foundation = Blend's own theme + TGSECCSL brand deltas (packages/design-tokens/src/blend.ts). */
const foundation = createBlendFoundation() as unknown as ThemeType;

/** WCAG AA (D-064): Blend's subtle warning / success / error tag text (600 on 50 ≈ 3:1) → the 700 shades (≥ 5:1). */
const warningTag = { text: { color: { subtle: { warning: '#CA3500', success: '#008236', error: '#C10007' } } } };
/** …and the stat card's "increase" green (green-600 on white = 3.2:1) → green-700. */
const statCard = { topContainer: { dataContainer: { statsContainer: { changeContainer: { change: { color: { increase: '#008236', decrease: '#C10007' } }, arrow: { color: { increase: '#008236', decrease: '#C10007' } } } } } } };
const componentTokens = { TAGV2: { sm: warningTag, lg: warningTag }, STATCARDV2: { sm: statCard, lg: statCard } } as unknown as ComponentTokenOverrides;

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(initialMode);

  useEffect(() => {
    // Drives the CSS variables in tokens.css; Blend reads `theme` below.
    document.documentElement.dataset.theme = mode;
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* non-fatal */
    }
  }, [mode]);

  const toggle = useCallback(() => setMode((m) => (m === 'light' ? 'dark' : 'light')), []);
  const value = useMemo(() => ({ mode, toggle }), [mode, toggle]);

  return (
    <ModeContext.Provider value={value}>
      <ThemeProvider foundationTokens={foundation} componentTokens={mode === 'dark' ? undefined : componentTokens} theme={mode === 'dark' ? Theme.DARK : Theme.LIGHT}>
        {children}
        <SnackbarV2 position={SnackbarV2Position.BOTTOM_RIGHT} />
      </ThemeProvider>
    </ModeContext.Provider>
  );
}

export function useThemeMode() {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error('useThemeMode must be used inside <AppThemeProvider>');
  return ctx;
}
