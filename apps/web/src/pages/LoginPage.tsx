import PlayArrow from '@mui/icons-material/PlayArrow';
import { Alert, Box, Button, Divider, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { DEMO_USER, PRESETS } from '@crane/shared';
import { useMemo, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ApiProblem } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Logo } from '../components/AppShell';
import { SheetPreview } from '../components/SheetPreview';

type Mode = 'signin' | 'register';

export function LoginPage() {
  const { status, login, register, demo, notice } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState<'form' | 'demo' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const hero = useMemo(() => PRESETS[2]!.inputs, []);

  const from = (location.state as { from?: string } | null)?.from ?? '/';
  if (status === 'authed') return <Navigate to={from} replace />;

  const fail = (e: unknown): void => {
    if (e instanceof ApiProblem) {
      const fields: Record<string, string> = {};
      for (const i of e.issues) fields[i.path] = i.message;
      setFieldErrors(fields);
      setError(Object.keys(fields).length ? null : e.message);
    } else {
      setError('Something went wrong. Try again.');
    }
  };

  const submit = async (ev: FormEvent): Promise<void> => {
    ev.preventDefault();
    setBusy('form');
    setError(null);
    setFieldErrors({});
    try {
      if (mode === 'signin') await login(email, password);
      else await register(email, password, displayName || undefined);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const tryDemo = async (): Promise<void> => {
    setBusy('demo');
    setError(null);
    setFieldErrors({});
    try {
      await demo();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.15fr 1fr' }, bgcolor: 'background.default' }}>
      <Box sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', justifyContent: 'center', p: 6, bgcolor: '#1b3a4b', color: '#fff', gap: 3 }}>
        <Typography variant="h1" component="p" sx={{ maxWidth: 520, lineHeight: 1.2 }}>
          A dimensioned crane drawing from five numbers.
        </Typography>
        <Typography sx={{ maxWidth: 520, opacity: 0.88 }}>
          Choose capacity, span, lift height and duty. Get a general-arrangement sheet with front, plan and end views, and see which dimensions are standard and which are estimates.
        </Typography>
        <Box sx={{ maxWidth: 620, bgcolor: '#fff', p: 1, borderRadius: 1, boxShadow: '0 8px 30px rgba(0,0,0,.35)' }} aria-hidden>
          <SheetPreview inputs={hero} name="Assembly hall: 20 t × 18 m" />
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: { xs: 2, sm: 4 } }}>
        <Paper variant="outlined" sx={{ width: '100%', maxWidth: 440, p: { xs: 2.5, sm: 4 } }}>
          <Stack spacing={2.5}>
            <Box sx={{ color: 'primary.main' }}>
              <Logo />
            </Box>
            <Typography variant="h2" component="h1">
              {mode === 'signin' ? 'Sign in' : 'Create an account'}
            </Typography>

            {notice && <Alert severity="info">{notice}</Alert>}

            <Button
              variant="contained"
              color="secondary"
              size="large"
              startIcon={<PlayArrow />}
              onClick={tryDemo}
              disabled={busy !== null}
              data-testid="demo-login"
              sx={{ color: (t) => t.palette.getContrastText(t.palette.secondary.main) }}
            >
              {busy === 'demo' ? 'Opening the demo…' : 'Try the demo'}
            </Button>
            <Typography variant="caption" color="text.secondary">
              Demo account: <b>{DEMO_USER.email}</b> / <b>{DEMO_USER.password}</b> (three sample cranes included, shared by everyone who tries it).
            </Typography>

            <Divider>or use your own account</Divider>

            <Tabs value={mode} onChange={(_e, v: Mode) => { setMode(v); setError(null); setFieldErrors({}); }} variant="fullWidth" aria-label="Sign in or register">
              <Tab value="signin" label="Sign in" />
              <Tab value="register" label="Register" />
            </Tabs>

            <Box component="form" onSubmit={submit} noValidate>
              <Stack spacing={2}>
                {mode === 'register' && (
                  <TextField label="Display name (optional)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" fullWidth />
                )}
                <TextField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  fullWidth
                  error={!!fieldErrors.email}
                  helperText={fieldErrors.email}
                />
                <TextField
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  required
                  fullWidth
                  error={!!fieldErrors.password}
                  helperText={fieldErrors.password ?? (mode === 'register' ? 'At least 8 characters.' : undefined)}
                />
                <Box aria-live="polite">{error && <Alert severity="error">{error}</Alert>}</Box>
                <Button type="submit" variant="contained" size="large" disabled={busy !== null || !email || !password}>
                  {busy === 'form' ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
                </Button>
              </Stack>
            </Box>
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}
