import { Chip, Tooltip } from '@mui/material';
import type { Confidence, DimStatus } from '@crane/shared';

const LABEL: Record<DimStatus, string> = { input: 'INPUT', standard: 'STANDARD', estimate: 'EST.' };
const HELP: Record<DimStatus, string> = {
  input: 'You typed this value.',
  standard: 'Taken from a standard or catalogue without adjustment.',
  estimate: 'An estimate from a rule of thumb or a calibration, not a published standard. Confirm before quoting.',
};

/** Status is always spelled out as text, never colour alone. */
export function StatusBadge({ status }: { status: DimStatus }) {
  return (
    <Tooltip title={HELP[status]}>
      <Chip
        size="small"
        label={LABEL[status]}
        variant={status === 'input' ? 'filled' : 'outlined'}
        color={status === 'estimate' ? 'warning' : status === 'input' ? 'primary' : 'default'}
        sx={{ height: 20, fontSize: '0.68rem', letterSpacing: '0.04em', ...(status === 'estimate' ? { borderStyle: 'dashed' } : {}) }}
      />
    </Tooltip>
  );
}

export function ConfidenceChip({ value }: { value: Confidence }) {
  if (value === 'n/a') return null;
  return (
    <Tooltip title="How sure the source is. See RESEARCH_NOTES.md for what each level means.">
      <Chip size="small" variant="outlined" label={`${value} confidence`} sx={{ height: 20, fontSize: '0.68rem', fontWeight: 500 }} />
    </Tooltip>
  );
}
