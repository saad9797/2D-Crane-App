import { Box } from '@mui/material';
import { analyze, buildScene, sceneToSvg, type CraneInputs } from '@crane/shared';
import { memo, useMemo } from 'react';

/** Static, non-interactive miniature of the sheet (list thumbnails and the login hero). Text is hidden at this size. */
export const SheetPreview = memo(function SheetPreview({ inputs, name, label }: { inputs: CraneInputs; name: string; label?: string }) {
  const svg = useMemo(() => {
    const a = analyze(inputs);
    if (!a.model) return null;
    return sceneToSvg(buildScene(a.model, { name, revision: 1, date: '' }));
  }, [inputs, name]);

  if (!svg) {
    return (
      <Box sx={{ aspectRatio: '420 / 297', display: 'grid', placeItems: 'center', bgcolor: 'action.hover', color: 'text.secondary', fontSize: 12 }}>
        Invalid inputs
      </Box>
    );
  }
  return (
    <Box
      role="img"
      aria-label={label ?? `Drawing of ${name}`}
      sx={{ lineHeight: 0, bgcolor: '#fff', '& svg': { width: '100%', height: 'auto', display: 'block' }, '& text': { display: 'none' } }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
});
