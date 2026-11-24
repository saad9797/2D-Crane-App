import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material';
import type { PaletteMode } from '@mui/material';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { buildTheme } from '../theme';

const KEY = 'crane.mode';

interface Value {
  mode: PaletteMode;
  toggle: () => void;
}
const Ctx = createContext<Value | null>(null);

function stored(): PaletteMode | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

export function ColorModeProvider({ children }: { children: ReactNode }) {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [chosen, setChosen] = useState<PaletteMode | null>(stored);
  const mode: PaletteMode = chosen ?? (prefersDark ? 'dark' : 'light');
  const theme = useMemo(() => buildTheme(mode), [mode]);
  const value = useMemo<Value>(
    () => ({
      mode,
      toggle: () => {
        const next: PaletteMode = mode === 'dark' ? 'light' : 'dark';
        setChosen(next);
        try {
          localStorage.setItem(KEY, next);
        } catch {
          /* not persisted */
        }
      },
    }),
    [mode],
  );
  return (
    <Ctx.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </Ctx.Provider>
  );
}

export function useColorMode(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error('useColorMode must be used inside ColorModeProvider');
  return v;
}
