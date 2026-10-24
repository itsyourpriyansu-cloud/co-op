// Light/dark mode for the console + the Blend ThemeProvider fed by our single token source.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SnackbarV2, SnackbarV2Position, Theme, ThemeProvider, type ThemeType } from '@juspay/blend-design-system';
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
      <ThemeProvider foundationTokens={foundation} theme={mode === 'dark' ? Theme.DARK : Theme.LIGHT}>
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
