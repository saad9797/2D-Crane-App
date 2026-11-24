import { Box, List, ListItem, ListItemText, Stack, Typography } from '@mui/material';
import type { Assumption } from '@crane/shared';
import { ConfidenceChip } from './Badges';

/** Everything that shapes the drawing without being an input: nothing is hidden. */
export function AssumptionsPanel({ assumptions, dimmed }: { assumptions: Assumption[]; dimmed?: boolean }) {
  return (
    <Box sx={{ opacity: dimmed ? 0.55 : 1 }}>
      <Typography variant="body2" sx={{ mb: 1 }}>
        These assumptions shape the drawing. None of them comes from you, so check each one before the drawing goes to a customer.
      </Typography>
      <List disablePadding>
        {assumptions.map((a) => (
          <ListItem key={a.id} disableGutters divider alignItems="flex-start" sx={{ gap: 1.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, minWidth: 24, pt: 0.5 }}>
              {a.id}
            </Typography>
            <ListItemText
              primary={a.text}
              secondary={
                <Stack component="span" direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                  <Typography component="span" variant="caption">
                    Source: {a.source}
                  </Typography>
                  <ConfidenceChip value={a.confidence} />
                </Stack>
              }
              primaryTypographyProps={{ variant: 'body2' }}
              secondaryTypographyProps={{ component: 'div' }}
            />
          </ListItem>
        ))}
      </List>
    </Box>
  );
}
