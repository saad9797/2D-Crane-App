import { Alert, AlertTitle, Box, LinearProgress } from '@mui/material';
import { useWakeState } from '../api/client';

/** Shown while a sleeping free-tier server boots (first request can take 30-60 s). */
export function WakeBanner() {
  const { waking, attempt } = useWakeState();
  if (!waking) return null;
  return (
    <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: (t) => t.zIndex.snackbar + 1 }} role="status" aria-live="polite">
      <Alert severity="info" variant="filled" icon={false} sx={{ borderRadius: 0, justifyContent: 'center' }}>
        <AlertTitle sx={{ mb: 0 }}>Waking up the server…</AlertTitle>
        The free hosting plan puts the API to sleep when idle. This takes up to a minute the first time{attempt > 3 ? ` (still trying, attempt ${attempt})` : ''}.
      </Alert>
      <LinearProgress />
    </Box>
  );
}
