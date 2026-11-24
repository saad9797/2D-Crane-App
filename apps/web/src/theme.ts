import { alpha, createTheme, type PaletteMode, type Theme } from '@mui/material/styles';

/**
 * "Engineering tool" look: slate-steel primary, crane-yellow/amber accent, square-ish corners,
 * dense controls, tabular numerals. The drawing sheet itself always stays white (it is paper).
 */
export const SANS = '"Segoe UI", "Helvetica Neue", Arial, system-ui, sans-serif';
export const MONO = 'ui-monospace, "Cascadia Mono", Consolas, "SFMono-Regular", Menlo, monospace';

export function buildTheme(mode: PaletteMode): Theme {
  const dark = mode === 'dark';
  const primary = dark ? '#7fb8d9' : '#1b3a4b';
  const accent = dark ? '#f2b134' : '#9a5b00';
  return createTheme({
    palette: {
      mode,
      primary: { main: primary, contrastText: dark ? '#0d1b24' : '#ffffff' },
      secondary: { main: accent },
      warning: { main: dark ? '#f2b134' : '#8a4b00', light: dark ? '#3a2d12' : '#fff4e0' },
      error: { main: dark ? '#ff8a80' : '#b3261e' },
      success: { main: dark ? '#7fd1a0' : '#1b6b3a' },
      background: dark ? { default: '#10161b', paper: '#182028' } : { default: '#eef1f4', paper: '#ffffff' },
      divider: dark ? alpha('#ffffff', 0.14) : alpha('#102a3a', 0.16),
      text: dark ? { primary: '#e8eef2', secondary: '#a9b8c2' } : { primary: '#14232d', secondary: '#4a5c68' },
    },
    shape: { borderRadius: 4 },
    typography: {
      fontFamily: SANS,
      fontSize: 14,
      h1: { fontSize: '1.6rem', fontWeight: 650, letterSpacing: '-0.01em' },
      h2: { fontSize: '1.25rem', fontWeight: 650 },
      h3: { fontSize: '1.05rem', fontWeight: 650 },
      h4: { fontSize: '0.95rem', fontWeight: 650 },
      subtitle2: { fontWeight: 650, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: '0.72rem' },
      button: { textTransform: 'none', fontWeight: 600 },
      caption: { fontSize: '0.75rem' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { fontVariantNumeric: 'tabular-nums' },
          '@media print': { body: { background: '#fff' } },
        },
      },
      MuiButton: { defaultProps: { disableElevation: true } },
      MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { outlined: { borderColor: dark ? alpha('#fff', 0.14) : alpha('#102a3a', 0.2) } } },
      MuiTextField: { defaultProps: { size: 'small', variant: 'outlined' } },
      MuiSelect: { defaultProps: { size: 'small' } },
      MuiTooltip: { defaultProps: { arrow: true, enterTouchDelay: 0 } },
      MuiTab: { styleOverrides: { root: { minHeight: 44, textTransform: 'none', fontWeight: 600 } } },
      MuiChip: { styleOverrides: { root: { borderRadius: 3, fontWeight: 650 } } },
      MuiAppBar: { defaultProps: { elevation: 0, color: 'primary' } },
      MuiOutlinedInput: { styleOverrides: { root: { backgroundColor: dark ? alpha('#000', 0.18) : '#fff' } } },
    },
  });
}
