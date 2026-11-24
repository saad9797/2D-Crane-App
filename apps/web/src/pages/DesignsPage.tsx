import Add from '@mui/icons-material/Add';
import ContentCopy from '@mui/icons-material/ContentCopy';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import MoreVert from '@mui/icons-material/MoreVert';
import OpenInNew from '@mui/icons-material/OpenInNew';
import Search from '@mui/icons-material/Search';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CardHeader,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Pagination,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { PRESETS, CRANE_TYPE_LABEL, type CraneType } from '@crane/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiProblem, type Design, type ListParams } from '../api/client';
import { useNotify } from '../components/Notify';
import { SheetPreview } from '../components/SheetPreview';
import { timeAgo, useDebounced } from '../lib/hooks';

const PAGE_SIZE = 12;
const SORTS: { value: ListParams['sort']; label: string }[] = [
  { value: 'updatedAt', label: 'Last edited' },
  { value: 'createdAt', label: 'Created' },
  { value: 'name', label: 'Name' },
  { value: 'capacityT', label: 'Capacity' },
  { value: 'spanM', label: 'Span' },
];

function DesignCard({ design, onDuplicate, onDelete }: { design: Design; onDuplicate: () => void; onDelete: () => void }) {
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = (): void => navigate(`/design/${design.id}`);
  return (
    <Card variant="outlined" sx={{ display: 'flex', flexDirection: 'column' }}>
      <CardHeader
        title={design.name}
        titleTypographyProps={{ variant: 'h4', noWrap: true, title: design.name }}
        subheader={`${design.capacityT} t · ${design.spanM} m · ${CRANE_TYPE_LABEL[design.craneType as CraneType] ?? design.craneType}`}
        subheaderTypographyProps={{ variant: 'caption', noWrap: true }}
        sx={{ pb: 0.5, '& .MuiCardHeader-content': { minWidth: 0 } }}
        action={
          <IconButton aria-label={`Actions for ${design.name}`} onClick={(e) => setAnchor(e.currentTarget)}>
            <MoreVert />
          </IconButton>
        }
      />
      <CardActionArea onClick={open} aria-label={`Open ${design.name}`} sx={{ flex: 1 }}>
        <Box sx={{ mx: 2, border: 1, borderColor: 'divider' }}>
          <SheetPreview inputs={design.inputs} name={design.name} />
        </Box>
        <CardContent sx={{ pt: 1.5, pb: '12px !important' }}>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            <Typography variant="caption" color="text.secondary">
              Edited {timeAgo(design.updatedAt)}
            </Typography>
            <Chip size="small" variant="outlined" label={`Rev ${design.revision}`} />
          </Stack>
          {design.notes && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {design.notes}
            </Typography>
          )}
        </CardContent>
      </CardActionArea>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => { setAnchor(null); open(); }}>
          <OpenInNew fontSize="small" sx={{ mr: 1 }} /> Open
        </MenuItem>
        <MenuItem onClick={() => { setAnchor(null); onDuplicate(); }}>
          <ContentCopy fontSize="small" sx={{ mr: 1 }} /> Duplicate
        </MenuItem>
        <MenuItem onClick={() => { setAnchor(null); onDelete(); }} sx={{ color: 'error.main' }}>
          <DeleteOutline fontSize="small" sx={{ mr: 1 }} /> Delete…
        </MenuItem>
      </Menu>
    </Card>
  );
}

function Skeletons() {
  return (
    <>
      {Array.from({ length: 6 }, (_, i) => (
        <Card key={i} variant="outlined" aria-hidden>
          <CardHeader title={<Skeleton width="60%" />} subheader={<Skeleton width="40%" />} />
          <Box sx={{ mx: 2 }}>
            <Skeleton variant="rectangular" sx={{ aspectRatio: '420 / 297', height: 'auto' }} />
          </Box>
          <CardContent>
            <Skeleton width="30%" />
          </CardContent>
        </Card>
      ))}
    </>
  );
}

export function DesignsPage() {
  const navigate = useNavigate();
  const notify = useNotify();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ListParams['sort']>('updatedAt');
  const [order, setOrder] = useState<ListParams['order']>('desc');
  const [page, setPage] = useState(1);
  const [toDelete, setToDelete] = useState<Design | null>(null);
  const q = useDebounced(search, 300);

  const params: ListParams = { q, sort, order, page, pageSize: PAGE_SIZE };
  const list = useQuery({ queryKey: ['designs', params], queryFn: ({ signal }) => api.listDesigns(params, signal), placeholderData: keepPreviousData });

  const duplicate = useMutation({
    mutationFn: (id: string) => api.duplicateDesign(id),
    onSuccess: ({ design }) => {
      void qc.invalidateQueries({ queryKey: ['designs'] });
      notify(`Created "${design.name}".`, 'success');
    },
    onError: (e: unknown) => notify(e instanceof ApiProblem ? e.message : 'Could not duplicate.', 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteDesign(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['designs'] });
      setToDelete(null);
      notify('Design deleted.', 'success');
    },
    onError: (e: unknown, id) => notify(e instanceof ApiProblem ? e.message : 'Could not delete.', 'error', () => remove.mutate(id)),
  });

  const data = list.data;
  const searching = q.trim().length > 0;

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h1" component="h1">
            My designs
          </Typography>
          <Typography color="text.secondary">Open a saved crane or start a new one.</Typography>
        </Box>
        <Button variant="contained" size="large" startIcon={<Add />} onClick={() => navigate('/design/new')} data-testid="new-design">
          New crane
        </Button>
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 3 }} alignItems={{ md: 'center' }}>
        <TextField
          placeholder="Search by name or notes"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          inputProps={{ 'aria-label': 'Search designs' }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
          sx={{ flex: 1, maxWidth: { md: 420 } }}
        />
        <TextField select label="Sort by" value={sort} onChange={(e) => { setSort(e.target.value as ListParams['sort']); setPage(1); }} sx={{ minWidth: 170 }}>
          {SORTS.map((s) => (
            <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
          ))}
        </TextField>
        <ToggleButtonGroup exclusive size="small" value={order} onChange={(_e, v: ListParams['order'] | null) => v && (setOrder(v), setPage(1))} aria-label="Sort order">
          <ToggleButton value="desc">{sort === 'name' ? 'Z → A' : 'High / new first'}</ToggleButton>
          <ToggleButton value="asc">{sort === 'name' ? 'A → Z' : 'Low / old first'}</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {list.isError && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" onClick={() => void list.refetch()}>Retry</Button>}>
          {list.error instanceof ApiProblem ? list.error.message : 'Could not load your designs.'}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' }, opacity: list.isPlaceholderData ? 0.6 : 1 }} aria-busy={list.isFetching}>
        {list.isPending && <Skeletons />}
        {data?.items.map((d) => (
          <DesignCard key={d.id} design={d} onDuplicate={() => duplicate.mutate(d.id)} onDelete={() => setToDelete(d)} />
        ))}
      </Box>

      {data && data.items.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, border: 1, borderStyle: 'dashed', borderColor: 'divider', borderRadius: 1 }}>
          <Typography variant="h2" gutterBottom>
            {searching ? `No designs match "${q.trim()}"` : 'No designs yet'}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            {searching ? 'Try a different word, or clear the search.' : 'Start from a preset to see a full drawing in seconds.'}
          </Typography>
          {searching ? (
            <Button onClick={() => setSearch('')}>Clear search</Button>
          ) : (
            <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap>
              {PRESETS.slice(0, 3).map((p) => (
                <Button key={p.id} variant="outlined" onClick={() => navigate(`/design/new?preset=${p.id}`)}>
                  {p.label}
                </Button>
              ))}
            </Stack>
          )}
        </Box>
      )}

      {data && data.totalPages > 1 && (
        <Stack alignItems="center" sx={{ mt: 4 }}>
          <Pagination count={data.totalPages} page={page} onChange={(_e, p) => setPage(p)} color="primary" />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
            {data.total} designs
          </Typography>
        </Stack>
      )}

      <Dialog open={!!toDelete} onClose={() => setToDelete(null)} aria-labelledby="delete-title">
        <DialogTitle id="delete-title">Delete this design?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            "{toDelete?.name}" will be permanently deleted. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setToDelete(null)}>Cancel</Button>
          <Button color="error" variant="contained" disabled={remove.isPending} onClick={() => toDelete && remove.mutate(toDelete.id)}>
            {remove.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
