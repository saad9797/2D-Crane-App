import { Alert, Box, Link, Stack, Typography } from '@mui/material';
import type { Issue } from '@crane/shared';

const FIELD_LABEL: Record<string, string> = {
  craneType: 'Crane type',
  capacityT: 'Capacity',
  dutyGroup: 'Duty group',
  spanM: 'Span',
  liftHeightM: 'Lift height',
  trolleyPositionPct: 'Trolley position',
  lowHeadroomHoist: 'Low-headroom hoist',
  railType: 'Runway rail',
  name: 'Name',
  notes: 'Notes',
};

const focusField = (path: string): void => {
  const el = document.getElementById(`field-${path}`);
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el?.querySelector<HTMLElement>('input, button, [role="combobox"]')?.focus({ preventScroll: true });
};

/** Errors block saving; warnings do not. Announced politely to screen readers whenever they change. */
export function IssueSummary({ issues }: { issues: Issue[] }) {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const announce = errors.length
    ? `${errors.length} input ${errors.length === 1 ? 'error' : 'errors'}: ${errors.map((e) => e.message).join(' ')}`
    : warnings.length
      ? `${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'}.`
      : '';

  return (
    <Box>
      <Box role="status" aria-live="polite" aria-atomic="true" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {announce}
      </Box>
      <Stack spacing={1}>
        {errors.length > 0 && (
          <Alert severity="error" data-testid="issues-errors">
            <Typography variant="body2" sx={{ fontWeight: 650 }}>
              {errors.length === 1 ? 'One input needs fixing' : `${errors.length} inputs need fixing`}. The drawing keeps the last valid version until then.
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {errors.map((e, i) => (
                <li key={`${e.path}-${i}`}>
                  <Link component="button" type="button" onClick={() => focusField(e.path.replace(/^inputs\./, ''))} sx={{ textAlign: 'left' }}>
                    {FIELD_LABEL[e.path.replace(/^inputs\./, '')] ?? e.path}
                  </Link>
                  : {e.message} {e.hint}
                </li>
              ))}
            </Box>
          </Alert>
        )}
        {warnings.length > 0 && (
          <Alert severity="warning" data-testid="issues-warnings">
            <Typography variant="body2" sx={{ fontWeight: 650 }}>
              {warnings.length === 1 ? 'Worth a second look' : `${warnings.length} things worth a second look`} (you can still save)
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {warnings.map((w, i) => (
                <li key={`${w.path}-${i}`}>
                  {w.message} {w.hint}
                </li>
              ))}
            </Box>
          </Alert>
        )}
      </Stack>
    </Box>
  );
}
