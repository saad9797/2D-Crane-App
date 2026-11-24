import ExpandMore from '@mui/icons-material/ExpandMore';
import { Accordion, AccordionDetails, AccordionSummary, Box, Stack, Typography } from '@mui/material';
import type { DimGroup, DimInfo } from '@crane/shared';
import { MONO } from '../theme';
import { ConfidenceChip, StatusBadge } from './Badges';

const GROUP_ORDER: DimGroup[] = ['Main', 'Girder', 'End carriage and wheels', 'Hoist and hook', 'Building clearances', 'Loads and limits'];

const fmt = (d: DimInfo): string => `${d.value.toLocaleString('en-GB', { maximumFractionDigits: 1 })}${d.unit ? ` ${d.unit}` : ''}`;

interface Props {
  dims: DimInfo[];
  hovered: string | null;
  onHover: (key: string | null) => void;
  dimmed?: boolean;
}

/** Every number the drawing uses, with where it came from. Hovering a row lights up the matching part of the drawing. */
export function CalcPanel({ dims, hovered, onHover, dimmed }: Props) {
  const estimates = dims.filter((d) => d.status === 'estimate').length;
  return (
    <Box sx={{ opacity: dimmed ? 0.55 : 1 }}>
      <Typography variant="body2" sx={{ mb: 1 }}>
        <b>{estimates}</b> of <b>{dims.length}</b> values are estimates. They are marked <b>*</b> on the drawing. Open a row to see its formula and source.
      </Typography>
      <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap' }} useFlexGap aria-label="Legend">
        <Stack direction="row" spacing={0.75} alignItems="center">
          <StatusBadge status="input" /> <Typography variant="caption">you typed it</Typography>
        </Stack>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <StatusBadge status="standard" /> <Typography variant="caption">from a standard</Typography>
        </Stack>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <StatusBadge status="estimate" /> <Typography variant="caption">rule of thumb</Typography>
        </Stack>
      </Stack>

      {GROUP_ORDER.map((g) => {
        const rows = dims.filter((d) => d.group === g);
        if (!rows.length) return null;
        return (
          <Box key={g} sx={{ mb: 2 }}>
            <Typography variant="subtitle2" component="h3" sx={{ mb: 0.5, color: 'text.secondary' }}>
              {g}
            </Typography>
            {rows.map((d) => (
              <Accordion
                key={d.key}
                disableGutters
                square
                variant="outlined"
                onMouseEnter={() => onHover(d.key)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(d.key)}
                onBlur={() => onHover(null)}
                sx={{
                  '&:before': { display: 'none' },
                  mt: '-1px',
                  ...(hovered === d.key ? { outline: 2, outlineStyle: 'solid', outlineColor: 'secondary.main', zIndex: 1, position: 'relative' } : {}),
                }}
                data-testid={`dim-${d.key}`}
              >
                <AccordionSummary expandIcon={<ExpandMore />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5, alignItems: 'center', gap: 1, flexWrap: 'wrap' } }}>
                  <Typography variant="body2" sx={{ flex: '1 1 140px' }}>
                    {d.label}
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: MONO, fontWeight: 650 }}>
                    {fmt(d)}
                    {d.status === 'estimate' ? '*' : ''}
                  </Typography>
                  <StatusBadge status={d.status} />
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    {d.help}
                  </Typography>
                  <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 1.5, rowGap: 0.5, fontSize: '0.8rem' }}>
                    <dt>Rule</dt>
                    <dd style={{ margin: 0, fontFamily: MONO }}>{d.formula}</dd>
                    <dt>Working</dt>
                    <dd style={{ margin: 0, fontFamily: MONO, overflowWrap: 'anywhere' }}>{d.working}</dd>
                    <dt>Source</dt>
                    <dd style={{ margin: 0 }}>
                      {d.source} <Typography component="span" variant="caption" color="text.secondary">(RESEARCH_NOTES.md)</Typography>
                    </dd>
                  </Box>
                  <Box sx={{ mt: 1 }}>
                    <ConfidenceChip value={d.confidence} />
                  </Box>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        );
      })}
    </Box>
  );
}
