import CenterFocusStrong from '@mui/icons-material/CenterFocusStrong';
import Print from '@mui/icons-material/Print';
import ZoomIn from '@mui/icons-material/ZoomIn';
import ZoomOut from '@mui/icons-material/ZoomOut';
import { Alert, Box, Divider, IconButton, Paper, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import type { DimInfo, ViewId } from '@crane/shared';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { MONO } from '../theme';
import { StatusBadge } from './Badges';

const SHEET_ASPECT = 420 / 297;
const MIN_K = 0.5;
const MAX_K = 12;
const HIGHLIGHT = '#d97706';

interface Props {
  svg: string | null;
  dims: DimInfo[];
  /** The inputs are invalid: keep showing the last good drawing, dimmed. */
  stale: boolean;
  hovered: string | null;
  onHover: (key: string | null) => void;
}

interface Tf {
  k: number;
  x: number;
  y: number;
}

const VIEW_LABEL: Record<ViewId, string> = { front: 'Front', plan: 'Plan', end: 'End' };

export function DrawingViewer({ svg, dims, stale, hovered, onHover }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 560 });
  const [tf, setTf] = useState<Tf>({ k: 1, x: 0, y: 0 });
  const [views, setViews] = useState<ViewId[]>(['front', 'plan', 'end']);
  const [showDims, setShowDims] = useState(true);
  const [tip, setTip] = useState<{ key: string; x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const fitted = useRef(false);

  // paper size in px at k = 1: fit inside the container with a small margin
  const paper = useMemo(() => {
    const pad = 16;
    const w = Math.max(200, Math.min(size.w - 2 * pad, (size.h - 2 * pad) * SHEET_ASPECT));
    return { w, h: w / SHEET_ASPECT };
  }, [size]);

  const fit = useCallback(() => setTf({ k: 1, x: (size.w - paper.w) / 2, y: (size.h - paper.h) / 2 }), [size, paper]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // re-fit on first size and whenever the container is resized, unless the user has zoomed
  useEffect(() => {
    if (!fitted.current || tf.k === 1) {
      fitted.current = true;
      fit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, paper]);

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setTf((t) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, t.k * factor));
      const f = k / t.k;
      return { k, x: cx - (cx - t.x) * f, y: cy - (cy - t.y) * f };
    });
  }, []);

  // wheel zoom needs a non-passive listener to stop the page scrolling
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: ReactPointerEvent): void => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, tx: tf.x, ty: tf.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent): void => {
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      if (d.moved) {
        setTf((t) => ({ ...t, x: d.tx + dx, y: d.ty + dy }));
        setTip(null);
        return;
      }
    }
    const target = (e.target as Element).closest('[data-dim]');
    const key = target?.getAttribute('data-dim') ?? null;
    if (key !== hovered) onHover(key);
    if (key && box.current) {
      const r = box.current.getBoundingClientRect();
      setTip({ key, x: e.clientX - r.left, y: e.clientY - r.top });
    } else {
      setTip(null);
    }
  };
  const onPointerUp = (): void => {
    drag.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const cx = size.w / 2;
    const cy = size.h / 2;
    const step = 40;
    if (e.key === '+' || e.key === '=') zoomAt(1.25, cx, cy);
    else if (e.key === '-') zoomAt(0.8, cx, cy);
    else if (e.key === '0') fit();
    else if (e.key === 'ArrowLeft') setTf((t) => ({ ...t, x: t.x + step }));
    else if (e.key === 'ArrowRight') setTf((t) => ({ ...t, x: t.x - step }));
    else if (e.key === 'ArrowUp') setTf((t) => ({ ...t, y: t.y + step }));
    else if (e.key === 'ArrowDown') setTf((t) => ({ ...t, y: t.y - step }));
    else return;
    e.preventDefault();
  };

  const hoveredDim = hovered ? dims.find((d) => d.key === hovered) : undefined;
  const dynamicCss = useMemo(() => {
    const rules: string[] = [];
    (['front', 'plan', 'end'] as const).forEach((v) => {
      if (!views.includes(v)) rules.push(`[data-view="${v}"]{display:none}`);
    });
    if (!showDims) rules.push('[data-dim]{display:none}');
    if (hoveredDim && /^\w+$/.test(hoveredDim.key)) {
      rules.push(`.e[data-dim="${hoveredDim.key}"]{stroke:${HIGHLIGHT}!important;stroke-width:.6!important}`);
      rules.push(`polygon[data-dim="${hoveredDim.key}"]{fill:${HIGHLIGHT}!important}`);
      rules.push(`text[data-dim="${hoveredDim.key}"]{fill:${HIGHLIGHT}!important;font-weight:700}`);
      rules.push(`.e[data-part="${hoveredDim.part}"]:not([data-dim]){stroke:${HIGHLIGHT}!important}`);
    }
    return rules.join('\n');
  }, [views, showDims, hoveredDim]);

  return (
    <Stack sx={{ height: '100%', minHeight: 0 }}>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
        className="no-print"
        sx={{ p: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
        role="toolbar"
        aria-label="Drawing controls"
      >
        <ToggleButtonGroup size="small" value={views} onChange={(_e, v: ViewId[]) => v.length && setViews(v)} aria-label="Visible views">
          {(['front', 'plan', 'end'] as const).map((v) => (
            <ToggleButton key={v} value={v} aria-label={`${VIEW_LABEL[v]} view`} sx={{ px: 1.5 }}>
              {VIEW_LABEL[v]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <ToggleButton size="small" value="dims" selected={showDims} onChange={() => setShowDims((s) => !s)} aria-pressed={showDims} sx={{ px: 1.5 }}>
          Dimensions
        </ToggleButton>
        <Divider orientation="vertical" flexItem />
        <Tooltip title="Zoom out (-)">
          <IconButton size="small" aria-label="Zoom out" onClick={() => zoomAt(0.8, size.w / 2, size.h / 2)}>
            <ZoomOut />
          </IconButton>
        </Tooltip>
        <Typography variant="caption" sx={{ minWidth: 40, textAlign: 'center' }} aria-live="off">
          {Math.round(tf.k * 100)}%
        </Typography>
        <Tooltip title="Zoom in (+)">
          <IconButton size="small" aria-label="Zoom in" onClick={() => zoomAt(1.25, size.w / 2, size.h / 2)}>
            <ZoomIn />
          </IconButton>
        </Tooltip>
        <Tooltip title="Fit sheet to screen (0)">
          <IconButton size="small" aria-label="Fit to screen" onClick={fit}>
            <CenterFocusStrong />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Print the sheet (A3 landscape)">
          <IconButton size="small" aria-label="Print drawing" onClick={() => window.print()}>
            <Print />
          </IconButton>
        </Tooltip>
      </Stack>

      <Box
        ref={box}
        tabIndex={0}
        role="group"
        aria-label="Drawing canvas. Drag to pan, scroll or use plus and minus to zoom, zero to fit."
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          drag.current = null;
          onHover(null);
          setTip(null);
        }}
        sx={{
          flex: 1,
          minHeight: 260,
          position: 'relative',
          overflow: 'hidden',
          touchAction: 'none',
          cursor: drag.current?.moved ? 'grabbing' : 'grab',
          bgcolor: (t) => (t.palette.mode === 'dark' ? '#0c1115' : '#d9dee3'),
          backgroundImage: (t) => `radial-gradient(${t.palette.mode === 'dark' ? '#1d2830' : '#c6cdd4'} 1px, transparent 1px)`,
          backgroundSize: '18px 18px',
          '&:focus-visible': { outline: 3, outlineStyle: 'solid', outlineColor: 'secondary.main', outlineOffset: -3 },
        }}
      >
        <style>{dynamicCss}</style>
        {svg ? (
          <Box
            className="print-sheet"
            data-testid="drawing-sheet"
            sx={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: paper.w,
              height: paper.h,
              transformOrigin: '0 0',
              transform: `translate(${tf.x}px, ${tf.y}px) scale(${tf.k})`,
              bgcolor: '#fff',
              boxShadow: '0 2px 12px rgba(0,0,0,.35)',
              lineHeight: 0,
              opacity: stale ? 0.4 : 1,
              transition: 'opacity .15s',
              '& svg': { width: '100%', height: '100%', display: 'block' },
              '& text': { userSelect: 'none' },
              '& [data-dim]': { cursor: 'help' },
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'text.secondary' }}>Fix the inputs to see a drawing.</Box>
        )}

        {stale && (
          <Alert severity="warning" sx={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', maxWidth: '90%' }} role="status">
            Showing the last valid drawing. Fix the highlighted inputs to update it.
          </Alert>
        )}

        {tip && hoveredDim && (
          <Paper
            variant="outlined"
            sx={{ position: 'absolute', left: Math.min(tip.x + 14, size.w - 300), top: Math.min(tip.y + 14, size.h - 170), width: 280, p: 1.25, pointerEvents: 'none', zIndex: 2, boxShadow: 4 }}
            role="tooltip"
          >
            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {hoveredDim.label}
              </Typography>
              <StatusBadge status={hoveredDim.status} />
            </Stack>
            <Typography sx={{ fontFamily: MONO, fontWeight: 700, fontSize: '1.05rem' }}>
              {hoveredDim.value.toLocaleString('en-GB', { maximumFractionDigits: 1 })} {hoveredDim.unit}
            </Typography>
            <Typography variant="caption" component="div" sx={{ fontFamily: MONO, overflowWrap: 'anywhere' }}>
              {hoveredDim.working}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Source {hoveredDim.source} · {hoveredDim.confidence === 'n/a' ? 'geometry' : `${hoveredDim.confidence} confidence`}
            </Typography>
          </Paper>
        )}
      </Box>
    </Stack>
  );
}
