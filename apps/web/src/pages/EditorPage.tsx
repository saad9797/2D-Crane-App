import ArrowBack from '@mui/icons-material/ArrowBack';
import ContentCopy from '@mui/icons-material/ContentCopy';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import FileDownload from '@mui/icons-material/FileDownload';
import MoreVert from '@mui/icons-material/MoreVert';
import Save from '@mui/icons-material/Save';
import {
  Alert,
  Badge,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  TextField,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { analyze, buildScene, hasErrors, sceneToSvg, type CraneInputs, type Issue } from '@crane/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useBlocker, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiProblem, type Design, type ExportFormat } from '../api/client';
import { AssumptionsPanel } from '../components/AssumptionsPanel';
import { CalcPanel } from '../components/CalcPanel';
import { DrawingViewer } from '../components/DrawingViewer';
import { InputsPanel, type Patch } from '../components/InputsPanel';
import { IssueSummary } from '../components/IssueSummary';
import { useNotify } from '../components/Notify';
import {
  baselineFromDesign,
  clearDraft,
  loadDraft,
  newDoc,
  NEW_NAME,
  sameDoc,
  saveDraft,
  type Baseline,
  type Doc,
} from '../editor/useEditorDoc';
import { downloadBlob, fileSlug, svgToPngBlob } from '../lib/export';
import { formatDate, useDebounced } from '../lib/hooks';

type TabId = 'inputs' | 'drawing' | 'dims' | 'assumptions';

const stripPrefix = (path: string): string => path.replace(/^inputs\./, '');
const today = (): string => new Date().toISOString().slice(0, 10);

/** Fetches the design (or builds a blank one) and hands a stable baseline to the editor. */
export function EditorPage() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const location = useLocation();
  const stateDesign = (location.state as { design?: Design } | null)?.design;

  const q = useQuery({
    queryKey: ['design', id],
    queryFn: () => api.getDesign(id as string),
    enabled: !!id,
    gcTime: 0,
    staleTime: Infinity,
    ...(stateDesign && stateDesign.id === id ? { initialData: { design: stateDesign, issues: [] as Issue[] } } : {}),
  });

  if (id && q.isPending) {
    return (
      <Stack spacing={2} sx={{ p: 3 }} aria-busy="true" aria-label="Loading design">
        <Skeleton variant="rectangular" height={48} />
        <Skeleton variant="rectangular" height={420} />
      </Stack>
    );
  }
  if (id && q.isError) {
    const e = q.error;
    return (
      <Box sx={{ p: 3, maxWidth: 560 }}>
        <Alert
          severity="error"
          action={e instanceof ApiProblem && e.status >= 500 || (e instanceof ApiProblem && e.status === 0) ? <Button color="inherit" onClick={() => void q.refetch()}>Retry</Button> : undefined}
        >
          {e instanceof ApiProblem ? (e.status === 404 ? 'That design does not exist (it may have been deleted).' : e.status === 403 ? 'That design belongs to another account.' : e.message) : 'Could not load the design.'}
        </Alert>
        <Button component={RouterLink} to="/" startIcon={<ArrowBack />} sx={{ mt: 2 }}>
          Back to my designs
        </Button>
      </Box>
    );
  }

  const baseline: Baseline = q.data ? baselineFromDesign(q.data.design) : { doc: newDoc(search.get('preset')), id: null, revision: null, updatedAt: null };
  return <Editor key={id ?? 'new'} initial={baseline} />;
}

function Editor({ initial }: { initial: Baseline }) {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('lg'));
  const navigate = useNavigate();
  const notify = useNotify();
  const qc = useQueryClient();

  const [base, setBase] = useState<Baseline>(initial);
  const [doc, setDoc] = useState<Doc>(() => {
    const draft = loadDraft(initial.id);
    return draft && !sameDoc(draft, initial.doc) ? draft : initial.doc;
  });
  const restored = useRef(!sameDoc(doc, initial.doc));
  const [serverIssues, setServerIssues] = useState<Issue[]>([]);
  const [tab, setTab] = useState<TabId>('inputs');
  const [hovered, setHovered] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [conflict, setConflict] = useState<Design | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null);
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const [leftW, setLeftW] = useState(420);

  const dirty = !sameDoc(doc, base.doc);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // ---- unsaved-changes protection ----
  const blocker = useBlocker(() => dirtyRef.current);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // keep a session draft so an expired login or accidental reload does not lose work
  useEffect(() => {
    if (dirty) saveDraft(base.id, doc);
    else clearDraft(base.id);
  }, [dirty, doc, base.id]);

  // ---- validation and live preview ----
  const analysis = useMemo(() => analyze(doc.inputs), [doc.inputs]);
  const issues = useMemo<Issue[]>(() => {
    const server = serverIssues.map((i) => ({ ...i, path: stripPrefix(i.path) }));
    const seen = new Set(server.map((i) => `${i.path}|${i.message}`));
    return [...server, ...analysis.issues.filter((i) => !seen.has(`${i.path}|${i.message}`))];
  }, [analysis.issues, serverIssues]);
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const nameError = doc.name.trim().length === 0 ? 'Give the design a name.' : doc.name.length > 120 ? 'Keep the name under 120 characters.' : null;

  const shownRevision = base.revision === null ? 1 : dirty ? base.revision + 1 : base.revision;
  const debouncedDoc = useDebounced({ inputs: doc.inputs, name: doc.name }, 120);
  const preview = useMemo(() => {
    const a = analyze(debouncedDoc.inputs);
    if (!a.ok || !a.model) return null;
    const name = debouncedDoc.name.trim() || NEW_NAME;
    const scene = buildScene(a.model, { name, revision: shownRevision, date: today() });
    return { svg: sceneToSvg(scene), dims: a.model.dims, assumptions: a.model.assumptions };
  }, [debouncedDoc, shownRevision]);
  const [lastGood, setLastGood] = useState(preview);
  useEffect(() => {
    if (preview) setLastGood(preview);
  }, [preview]);
  const shown = preview ?? lastGood;
  const stale = !analysis.ok || preview === null;

  // ---- editing ----
  const patch = useCallback((p: Patch) => {
    setServerIssues([]);
    setDoc((d) => ({ ...d, inputs: { ...d.inputs, ...p } }));
  }, []);

  const applySaved = useCallback(
    (d: Design) => {
      const b = baselineFromDesign(d);
      dirtyRef.current = false;
      clearDraft(base.id);
      clearDraft(d.id);
      setBase(b);
      setDoc(b.doc);
      setServerIssues([]);
      qc.setQueryData(['design', d.id], { design: d, issues: [] });
      void qc.invalidateQueries({ queryKey: ['designs'] });
    },
    [base.id, qc],
  );

  const handleSaveError = useCallback(
    (e: unknown, retry: () => void) => {
      if (e instanceof ApiProblem && e.status === 409 && e.code === 'revision_conflict') {
        setConflict(e.body.current as Design);
      } else if (e instanceof ApiProblem && (e.status === 400 || e.status === 422)) {
        setServerIssues(e.issues);
        notify('The server rejected some inputs. See the highlighted fields.', 'error');
        setTab('inputs');
      } else if (e instanceof ApiProblem && e.status === 404) {
        notify('This design no longer exists on the server. Use "Save as copy" to keep your work.', 'error');
      } else {
        notify(e instanceof ApiProblem ? e.message : 'Could not save.', 'error', retry);
      }
    },
    [notify],
  );

  const create = useCallback(
    async (d: Doc, asCopy: boolean): Promise<void> => {
      const { design } = await api.createDesign({ name: d.name.trim(), notes: d.notes, inputs: d.inputs });
      applySaved(design);
      notify(asCopy ? `Saved a copy as "${design.name}".` : 'Saved.', 'success');
      navigate(`/design/${design.id}`, { replace: true, state: { design } });
    },
    [applySaved, navigate, notify],
  );

  const save = useCallback(async (): Promise<void> => {
    if (nameError) {
      notify(nameError, 'warning');
      return;
    }
    if (hasErrors(analyze(doc.inputs).issues)) {
      notify('Fix the highlighted inputs before saving.', 'warning');
      setTab('inputs');
      return;
    }
    setSaving(true);
    try {
      if (base.id === null || base.revision === null) {
        await create(doc, false);
      } else {
        const { design } = await api.updateDesign(base.id, { name: doc.name.trim(), notes: doc.notes, inputs: doc.inputs, revision: base.revision });
        applySaved(design);
        notify(`Saved as revision ${design.revision}.`, 'success');
      }
    } catch (e) {
      handleSaveError(e, () => void save());
    } finally {
      setSaving(false);
    }
  }, [applySaved, base.id, base.revision, create, doc, handleSaveError, nameError, notify]);

  const saveAsCopy = useCallback(async (): Promise<void> => {
    if (nameError || hasErrors(analyze(doc.inputs).issues)) {
      notify('Fix the highlighted fields before saving a copy.', 'warning');
      return;
    }
    setSaving(true);
    try {
      await create({ ...doc, name: base.id ? `Copy of ${doc.name}`.slice(0, 120) : doc.name }, true);
    } catch (e) {
      handleSaveError(e, () => void saveAsCopy());
    } finally {
      setSaving(false);
    }
  }, [base.id, create, doc, handleSaveError, nameError, notify]);

  const resolveConflict = async (choice: 'overwrite' | 'theirs' | 'copy'): Promise<void> => {
    const theirs = conflict;
    if (!theirs) return;
    setConflict(null);
    if (choice === 'theirs') {
      applySaved(theirs);
      notify('Loaded the newer version from the server.', 'info');
      return;
    }
    setSaving(true);
    try {
      if (choice === 'overwrite') {
        const { design } = await api.updateDesign(theirs.id, { name: doc.name.trim(), notes: doc.notes, inputs: doc.inputs, revision: theirs.revision });
        applySaved(design);
        notify(`Saved as revision ${design.revision}, replacing the other changes.`, 'success');
      } else {
        await create({ ...doc, name: `Copy of ${doc.name}`.slice(0, 120) }, true);
      }
    } catch (e) {
      handleSaveError(e, () => void resolveConflict(choice));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!base.id) return;
    try {
      await api.deleteDesign(base.id);
      dirtyRef.current = false;
      clearDraft(base.id);
      void qc.invalidateQueries({ queryKey: ['designs'] });
      notify('Design deleted.', 'success');
      navigate('/');
    } catch (e) {
      notify(e instanceof ApiProblem ? e.message : 'Could not delete.', 'error', () => void remove());
    }
  };

  const exportAs = async (format: ExportFormat | 'png'): Promise<void> => {
    setExportAnchor(null);
    const a = analyze(doc.inputs);
    if (!a.ok || !a.model) {
      notify('Fix the highlighted inputs before exporting.', 'warning');
      return;
    }
    const name = doc.name.trim() || NEW_NAME;
    const file = `${fileSlug(name)}-rev${shownRevision}`;
    setExporting(true);
    try {
      if (format === 'png') {
        const svg = sceneToSvg(buildScene(a.model, { name, revision: shownRevision, date: today() }), { standalone: true });
        downloadBlob(await svgToPngBlob(svg), `${file}.png`);
      } else {
        downloadBlob(await api.exportFile(format, { inputs: doc.inputs, name, revision: shownRevision }), `${file}.${format}`);
      }
      notify(`Exported ${format.toUpperCase()}.`, 'success');
    } catch (e) {
      notify(e instanceof ApiProblem ? e.message : 'Export failed.', 'error', () => void exportAs(format));
    } finally {
      setExporting(false);
    }
  };

  // ---- panels ----
  const inputsPanel = (
    <Stack spacing={2}>
      {restored.current && (
        <Alert severity="info" onClose={() => (restored.current = false)}>
          Restored your unsaved changes from earlier in this session.
        </Alert>
      )}
      <IssueSummary issues={issues} />
      <InputsPanel
        inputs={doc.inputs}
        issues={issues}
        notes={doc.notes}
        onChange={patch}
        onNotes={(notes) => setDoc((d) => ({ ...d, notes }))}
        onPreset={(inputs: CraneInputs, label) => {
          setServerIssues([]);
          setDoc((d) => ({ ...d, inputs: { ...inputs }, name: base.id || d.name !== NEW_NAME ? d.name : label }));
        }}
      />
    </Stack>
  );
  const dimsPanel = shown ? <CalcPanel dims={shown.dims} hovered={hovered} onHover={setHovered} dimmed={stale} /> : <Alert severity="info">Fix the inputs to see calculated dimensions.</Alert>;
  const assumptionsPanel = shown ? <AssumptionsPanel assumptions={shown.assumptions} dimmed={stale} /> : null;
  const viewer = <DrawingViewer svg={shown?.svg ?? null} dims={shown?.dims ?? []} stale={stale} hovered={hovered} onHover={setHovered} />;

  const badge = (label: string, count: number, color: 'error' | 'warning') => (count > 0 ? <Badge badgeContent={count} color={color} sx={{ '& .MuiBadge-badge': { right: -14, top: 10 } }}>{label}</Badge> : label);
  const inputsLabel = badge('Inputs', errorCount || warningCount, errorCount ? 'error' : 'warning');

  const toolbar = (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      className="no-print"
      sx={{ px: { xs: 1.5, md: 2 }, py: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', flexWrap: 'wrap', rowGap: 1 }}
    >
      <IconButton component={RouterLink} to="/" aria-label="Back to my designs" size="small">
        <ArrowBack />
      </IconButton>
      <TextField
        variant="standard"
        value={doc.name}
        onChange={(e) => setDoc((d) => ({ ...d, name: e.target.value }))}
        placeholder={NEW_NAME}
        error={!!nameError}
        helperText={nameError}
        inputProps={{ 'aria-label': 'Design name', maxLength: 140, style: { fontSize: '1.1rem', fontWeight: 650 } }}
        sx={{ flex: '1 1 220px', minWidth: 160, maxWidth: 460 }}
      />
      {dirty ? (
        <Chip size="small" color="warning" variant="outlined" label="Unsaved changes" role="status" data-testid="dirty-chip" />
      ) : (
        <Chip size="small" variant="outlined" label={base.id ? `Saved · rev ${base.revision}${base.updatedAt ? ` · ${formatDate(base.updatedAt)}` : ''}` : 'Not saved yet'} data-testid="saved-chip" />
      )}
      <Box sx={{ flex: 1 }} />
      <Button
        variant="contained"
        startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Save />}
        onClick={() => void save()}
        disabled={saving || (!dirty && base.id !== null)}
        data-testid="save-button"
      >
        {saving ? 'Saving…' : 'Save'}
      </Button>
      <Button
        variant="outlined"
        startIcon={exporting ? <CircularProgress size={16} /> : <FileDownload />}
        onClick={(e) => setExportAnchor(e.currentTarget)}
        disabled={exporting || errorCount > 0}
        aria-haspopup="menu"
        data-testid="export-button"
      >
        Export
      </Button>
      <IconButton aria-label="More actions" onClick={(e) => setMoreAnchor(e.currentTarget)} size="small">
        <MoreVert />
      </IconButton>
      <Menu anchorEl={exportAnchor} open={!!exportAnchor} onClose={() => setExportAnchor(null)}>
        <MenuItem onClick={() => void exportAs('pdf')} data-testid="export-pdf"><ListItemText primary="PDF" secondary="A3 landscape, vector" /></MenuItem>
        <MenuItem onClick={() => void exportAs('svg')} data-testid="export-svg"><ListItemText primary="SVG" secondary="Scalable vector" /></MenuItem>
        <MenuItem onClick={() => void exportAs('dxf')} data-testid="export-dxf"><ListItemText primary="DXF" secondary="Opens in CAD (sheet size)" /></MenuItem>
        <MenuItem onClick={() => void exportAs('png')} data-testid="export-png"><ListItemText primary="PNG" secondary="Image, 2480 × 1754 px" /></MenuItem>
      </Menu>
      <Menu anchorEl={moreAnchor} open={!!moreAnchor} onClose={() => setMoreAnchor(null)}>
        <MenuItem onClick={() => { setMoreAnchor(null); void saveAsCopy(); }} data-testid="save-copy">
          <ListItemIcon><ContentCopy fontSize="small" /></ListItemIcon>
          <ListItemText>Save as copy</ListItemText>
        </MenuItem>
        <MenuItem disabled={!base.id} onClick={() => { setMoreAnchor(null); setConfirmDelete(true); }} sx={{ color: 'error.main' }} data-testid="delete-design">
          <ListItemIcon><DeleteOutline fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>Delete…</ListItemText>
        </MenuItem>
      </Menu>
    </Stack>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: { xs: 1, lg: 'none' }, minHeight: 0, height: { lg: 'calc(100dvh - 48px)' } }}>
      {toolbar}

      {wide ? (
        <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <Box sx={{ width: leftW, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, bgcolor: 'background.default' }} className="no-print">
            <Tabs value={tab === 'drawing' ? 'inputs' : tab} onChange={(_e, v: TabId) => setTab(v)} variant="fullWidth" aria-label="Design panels" sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
              <Tab value="inputs" label={inputsLabel} id="tab-inputs" aria-controls="panel-inputs" />
              <Tab value="dims" label="Dimensions" id="tab-dims" aria-controls="panel-dims" />
              <Tab value="assumptions" label="Assumptions" id="tab-assumptions" aria-controls="panel-assumptions" />
            </Tabs>
            <Box role="tabpanel" id={`panel-${tab === 'drawing' ? 'inputs' : tab}`} aria-labelledby={`tab-${tab === 'drawing' ? 'inputs' : tab}`} sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
              {tab === 'dims' ? dimsPanel : tab === 'assumptions' ? assumptionsPanel : inputsPanel}
            </Box>
          </Box>
          <ResizeHandle width={leftW} onChange={setLeftW} />
          <Box sx={{ flex: 1, minWidth: 0 }}>{viewer}</Box>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <Tabs value={tab} onChange={(_e, v: TabId) => setTab(v)} variant="fullWidth" aria-label="Design panels" className="no-print" sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
            <Tab value="inputs" label={inputsLabel} id="tab-inputs" aria-controls="panel-inputs" />
            <Tab value="drawing" label="Drawing" id="tab-drawing" aria-controls="panel-drawing" />
            <Tab value="dims" label="Dims" id="tab-dims" aria-controls="panel-dims" />
            <Tab value="assumptions" label="Notes" id="tab-assumptions" aria-controls="panel-assumptions" />
          </Tabs>
          <Box role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} sx={{ flex: 1, minHeight: 0, overflowY: tab === 'drawing' ? 'hidden' : 'auto', p: tab === 'drawing' ? 0 : 2, display: 'flex', flexDirection: 'column' }}>
            {tab === 'inputs' && inputsPanel}
            {tab === 'drawing' && <Box sx={{ flex: 1, minHeight: 420 }}>{viewer}</Box>}
            {tab === 'dims' && dimsPanel}
            {tab === 'assumptions' && assumptionsPanel}
          </Box>
        </Box>
      )}

      {/* leaving with unsaved changes */}
      <Dialog open={blocker.state === 'blocked'} aria-labelledby="leave-title">
        <DialogTitle id="leave-title">Leave without saving?</DialogTitle>
        <DialogContent>
          <DialogContentText>You have unsaved changes to "{doc.name}". If you leave now they will be lost.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => blocker.state === 'blocked' && blocker.reset()}>Stay and keep editing</Button>
          <Button
            color="error"
            onClick={() => {
              clearDraft(base.id);
              dirtyRef.current = false;
              if (blocker.state === 'blocked') blocker.proceed();
            }}
          >
            Discard changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* someone (or another tab) saved a newer revision */}
      <Dialog open={!!conflict} aria-labelledby="conflict-title">
        <DialogTitle id="conflict-title">This design was changed elsewhere</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Revision {conflict?.revision} was saved{conflict ? ` on ${formatDate(conflict.updatedAt)}` : ''}, after you opened revision {base.revision}. Saving now would replace those changes. What would you like to do?
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1, justifyContent: 'flex-end' }}>
          <Button onClick={() => setConflict(null)}>Cancel</Button>
          <Button onClick={() => void resolveConflict('theirs')}>Load the newer version (discard mine)</Button>
          <Button onClick={() => void resolveConflict('copy')}>Save mine as a copy</Button>
          <Button variant="contained" color="warning" onClick={() => void resolveConflict('overwrite')}>
            Overwrite with mine
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} aria-labelledby="del-title">
        <DialogTitle id="del-title">Delete this design?</DialogTitle>
        <DialogContent>
          <DialogContentText>"{base.doc.name}" will be permanently deleted. This cannot be undone.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => { setConfirmDelete(false); void remove(); }}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}

/** Drag (or use arrow keys) to resize the inputs panel on wide screens. */
function ResizeHandle({ width, onChange }: { width: number; onChange: (w: number) => void }) {
  const clamp = (w: number): number => Math.min(640, Math.max(320, w));
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    const startX = e.clientX;
    const startW = width;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent): void => onChange(clamp(startW + ev.clientX - startX));
    const up = (): void => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  return (
    <Box
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize inputs panel"
      aria-valuenow={width}
      aria-valuemin={320}
      aria-valuemax={640}
      tabIndex={0}
      className="no-print"
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onChange(clamp(width - 24));
        if (e.key === 'ArrowRight') onChange(clamp(width + 24));
      }}
      sx={{
        width: 6,
        cursor: 'col-resize',
        flexShrink: 0,
        bgcolor: 'divider',
        '&:hover, &:focus-visible': { bgcolor: 'secondary.main' },
        '&:focus-visible': { outline: 'none' },
        touchAction: 'none',
      }}
    />
  );
}
