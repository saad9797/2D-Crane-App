import ExpandMore from '@mui/icons-material/ExpandMore';
import HelpOutline from '@mui/icons-material/HelpOutline';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  FormControlLabel,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  Slider,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  CAPACITY_SERIES_T,
  CRANE_TYPES,
  DIN536,
  DUTY_DESCRIPTION,
  DUTY_GROUPS,
  LIMITS,
  PRESETS,
  RAIL_TYPES,
  type CraneInputs,
  type CraneType,
  type Issue,
} from '@crane/shared';
import { useEffect, useId, useState, type ReactNode } from 'react';

export type Patch = Partial<CraneInputs>;

const fieldIssues = (issues: Issue[], path: string): Issue[] => issues.filter((i) => i.path === path);

function FieldMessage({ issues, help }: { issues: Issue[]; help: ReactNode }) {
  const first = issues[0];
  if (!first) return <>{help}</>;
  return (
    <>
      {first.message}
      {first.hint ? ` ${first.hint}` : ''}
    </>
  );
}

const worst = (issues: Issue[]): 'error' | 'warning' | null => (issues.some((i) => i.severity === 'error') ? 'error' : issues.length ? 'warning' : null);

function Label({ text, tip, htmlFor }: { text: string; tip: string; htmlFor?: string }) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.5}>
      <Typography component="label" htmlFor={htmlFor} variant="body2" sx={{ fontWeight: 650 }}>
        {text}
      </Typography>
      <Tooltip title={tip} enterTouchDelay={0}>
        <IconButton size="small" aria-label={`What is ${text.toLowerCase()}?`} sx={{ p: 0.25 }}>
          <HelpOutline sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

interface NumberFieldProps {
  path: keyof CraneInputs;
  label: string;
  unit: string;
  tip: string;
  help: string;
  value: number;
  min: number;
  max: number;
  step: number;
  sliderStep?: number;
  issues: Issue[];
  onChange: (n: number) => void;
}

/** Slider plus numeric field. The text field keeps what you type (even "12.") and reports NaN when it is not a number. */
function NumberSliderField({ path, label, unit, tip, help, value, min, max, step, sliderStep, issues, onChange }: NumberFieldProps) {
  const id = useId();
  const mine = fieldIssues(issues, path);
  const [text, setText] = useState(String(value));
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (!typing) setText(Number.isNaN(value) ? '' : String(value));
  }, [value, typing]);

  const sliderValue = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
  const state = worst(mine);
  return (
    <Box id={`field-${path}`}>
      <Label text={label} tip={tip} htmlFor={`${id}-num`} />
      <Stack direction="row" spacing={2} alignItems="flex-start">
        <Slider
          value={sliderValue}
          min={min}
          max={max}
          step={sliderStep ?? step}
          onChange={(_e, v) => {
            setTyping(false);
            onChange(Number((v as number).toFixed(2)));
          }}
          aria-label={`${label} slider`}
          getAriaValueText={(v) => `${v} ${unit}`}
          sx={{ mt: 1.4, flex: 1 }}
          color={state === 'error' ? 'error' : 'primary'}
        />
        <TextField
          id={`${id}-num`}
          value={text}
          onFocus={() => setTyping(true)}
          onBlur={() => setTyping(false)}
          onChange={(e) => {
            setText(e.target.value);
            const t = e.target.value.trim().replace(',', '.');
            onChange(t === '' ? NaN : Number(t));
          }}
          inputProps={{ inputMode: 'decimal', 'aria-describedby': `${id}-msg`, 'aria-invalid': state === 'error' }}
          InputProps={{ endAdornment: <Typography variant="caption" color="text.secondary">{unit}</Typography> }}
          error={state === 'error'}
          color={state === 'warning' ? 'warning' : undefined}
          sx={{ width: 118 }}
        />
      </Stack>
      <Typography
        id={`${id}-msg`}
        variant="caption"
        sx={{ display: 'block', mt: 0.25, color: state === 'error' ? 'error.main' : state === 'warning' ? 'warning.main' : 'text.secondary' }}
      >
        <FieldMessage issues={mine} help={help} />
      </Typography>
    </Box>
  );
}

function Section({ title, children, defaultExpanded = true }: { title: string; children: ReactNode; defaultExpanded?: boolean }) {
  return (
    <Accordion defaultExpanded={defaultExpanded} disableGutters variant="outlined" square sx={{ '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMore />}>
        <Typography variant="subtitle2" component="h3">
          {title}
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2.5}>{children}</Stack>
      </AccordionDetails>
    </Accordion>
  );
}

interface Props {
  inputs: CraneInputs;
  issues: Issue[];
  notes: string;
  onChange: (p: Patch) => void;
  onNotes: (n: string) => void;
  onPreset: (inputs: CraneInputs, label: string) => void;
}

const TYPE_HELP: Record<CraneType, string> = {
  'double-girder': 'Two main beams, trolley on top. Usual above about 10 t and for long spans.',
  'single-girder': 'One main beam, hoist hangs below it. Lighter and cheaper, up to about 20 t.',
};

export function InputsPanel({ inputs, issues, notes, onChange, onNotes, onPreset }: Props) {
  const [presetAnchor, setPresetAnchor] = useState<HTMLElement | null>(null);
  const capIssues = fieldIssues(issues, 'capacityT');
  const dutyIssues = fieldIssues(issues, 'dutyGroup');
  const typeIssues = fieldIssues(issues, 'craneType');
  const railIssues = fieldIssues(issues, 'railType');
  const lowIssues = fieldIssues(issues, 'lowHeadroomHoist');
  const single = inputs.craneType === 'single-girder';

  return (
    <Stack spacing={1.5}>
      <Box>
        <Button variant="outlined" fullWidth onClick={(e) => setPresetAnchor(e.currentTarget)} aria-haspopup="menu" data-testid="presets-button">
          Start from a preset…
        </Button>
        <Menu anchorEl={presetAnchor} open={!!presetAnchor} onClose={() => setPresetAnchor(null)}>
          {PRESETS.map((p) => (
            <MenuItem key={p.id} onClick={() => { setPresetAnchor(null); onPreset(p.inputs, p.label); }}>
              <ListItemText primary={p.label} secondary={p.description} />
            </MenuItem>
          ))}
        </Menu>
      </Box>

      <Section title="Capacity and duty">
        <Box id="field-craneType">
          <Label text="Crane type" tip="Single girder has one main beam with the hoist hanging under it. Double girder has two beams and the trolley runs on top, which gives more hook height and suits heavier loads." />
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            color="primary"
            value={inputs.craneType}
            onChange={(_e, v: CraneType | null) => {
              if (!v) return;
              onChange({ craneType: v, ...(v === 'double-girder' ? { lowHeadroomHoist: false } : {}) });
            }}
            aria-label="Crane type"
            sx={{ mt: 0.5 }}
          >
            {CRANE_TYPES.map((t) => (
              <ToggleButton key={t} value={t}>
                {t === 'double-girder' ? 'Double girder' : 'Single girder'}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Typography variant="caption" color={typeIssues.length ? 'error' : 'text.secondary'} sx={{ display: 'block', mt: 0.5 }}>
            <FieldMessage issues={typeIssues} help={TYPE_HELP[inputs.craneType]} />
          </Typography>
        </Box>

        <Box id="field-capacityT">
          <Label text="Capacity" tip="Rated load: the heaviest load the crane is allowed to lift (safe working load), in tonnes. The choices are the standard preferred series (IS 3177)." htmlFor="capacity-select" />
          <TextField
            select
            fullWidth
            id="capacity-select"
            value={CAPACITY_SERIES_T.includes(inputs.capacityT as never) ? inputs.capacityT : ''}
            onChange={(e) => onChange({ capacityT: Number(e.target.value) })}
            error={capIssues.some((i) => i.severity === 'error')}
            color={capIssues.length ? 'warning' : undefined}
            helperText={<FieldMessage issues={capIssues} help="Standard sizes only. Pick the heaviest load you will ever lift." />}
            inputProps={{ 'aria-label': 'Capacity in tonnes' }}
            SelectProps={{ renderValue: (v) => `${String(v)} t` }}
            sx={{ mt: 0.5 }}
          >
            {CAPACITY_SERIES_T.map((c) => (
              <MenuItem key={c} value={c}>
                {c} t
              </MenuItem>
            ))}
          </TextField>
        </Box>

        <Box id="field-dutyGroup">
          <Label text="Duty group" tip="How hard the crane works: how often it lifts and how close to full load. A1 is occasional light use; A8 is near-continuous heavy use (FEM/ISO 4301 groups). Heavier duty gives a deeper, stiffer girder here." htmlFor="duty-select" />
          <TextField
            select
            fullWidth
            id="duty-select"
            value={inputs.dutyGroup}
            onChange={(e) => onChange({ dutyGroup: Number(e.target.value) })}
            error={dutyIssues.some((i) => i.severity === 'error')}
            color={dutyIssues.length ? 'warning' : undefined}
            helperText={<FieldMessage issues={dutyIssues} help={`A${inputs.dutyGroup}: ${DUTY_DESCRIPTION[inputs.dutyGroup] ?? ''}. Not sure? A5 suits a typical workshop.`} />}
            SelectProps={{ renderValue: (v) => `A${String(v)} · ${DUTY_DESCRIPTION[Number(v)] ?? ''}` }}
            inputProps={{ 'aria-label': 'Duty group' }}
            sx={{ mt: 0.5 }}
          >
            {DUTY_GROUPS.map((g) => (
              <MenuItem key={g} value={g}>
                <ListItemText primary={`A${g}`} secondary={DUTY_DESCRIPTION[g]} />
              </MenuItem>
            ))}
          </TextField>
        </Box>
      </Section>

      <Section title="Geometry">
        <NumberSliderField
          path="spanM"
          label="Span"
          unit="m"
          tip="Span is the distance between the centre-lines of the two runway rails the crane rides on. It is roughly the building width minus the clearance on each side."
          help="Rail centre to rail centre, 5 to 35 m."
          value={inputs.spanM}
          {...LIMITS.spanM}
          sliderStep={0.5}
          issues={issues}
          onChange={(n) => onChange({ spanM: n })}
        />
        <NumberSliderField
          path="liftHeightM"
          label="Lift height"
          unit="m"
          tip="Lift height (height of lift) is how far the hook travels from its highest to its lowest position. It is not the building height."
          help="Hook travel from highest to lowest position, 2 to 30 m."
          value={inputs.liftHeightM}
          {...LIMITS.liftHeightM}
          sliderStep={0.5}
          issues={issues}
          onChange={(n) => onChange({ liftHeightM: n })}
        />
      </Section>

      <Section title="Hoist and trolley">
        <NumberSliderField
          path="trolleyPositionPct"
          label="Trolley position"
          unit="%"
          tip="Where the hoist is drawn along the bridge. 0 % puts the hook at its closest approach to the left rail; 100 % at the right. It only changes the picture, not the crane."
          help="Drawing position only. 0 % = left end stop."
          value={inputs.trolleyPositionPct}
          {...LIMITS.trolleyPositionPct}
          issues={issues}
          onChange={(n) => onChange({ trolleyPositionPct: n })}
        />
        <Box id="field-lowHeadroomHoist">
          <FormControlLabel
            control={
              <Switch
                checked={inputs.lowHeadroomHoist}
                disabled={!single}
                onChange={(e) => onChange({ lowHeadroomHoist: e.target.checked })}
                inputProps={{ 'aria-describedby': 'low-headroom-help' }}
              />
            }
            label={
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <span>Low-headroom hoist</span>
                <Tooltip title="A compact hoist that sits between the girder flanges so the hook stays higher under the girder. Useful when the roof is low. Single girder only (the company sample uses one).">
                  <IconButton size="small" aria-label="What is a low-headroom hoist?" sx={{ p: 0.25 }}>
                    <HelpOutline sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Stack>
            }
          />
          <Typography id="low-headroom-help" variant="caption" color={lowIssues.length ? 'error' : 'text.secondary'} sx={{ display: 'block' }}>
            <FieldMessage issues={lowIssues} help={single ? 'Keeps the hook closer to the girder.' : 'Only available on single-girder cranes.'} />
          </Typography>
        </Box>
      </Section>

      <Section title="Runway and rails">
        <Box id="field-railType">
          <Label text="Runway rail" tip="The rail on the runway beam that the crane wheels run on. DIN 536 'A' rails are named by head width in mm. Auto picks the lightest rail for the estimated wheel load; choose one if your runway already exists." htmlFor="rail-select" />
          <TextField
            select
            fullWidth
            id="rail-select"
            value={inputs.railType}
            onChange={(e) => onChange({ railType: e.target.value as CraneInputs['railType'] })}
            error={railIssues.some((i) => i.severity === 'error')}
            color={railIssues.length ? 'warning' : undefined}
            helperText={<FieldMessage issues={railIssues} help="Auto = lightest rail that covers the estimated wheel load." />}
            sx={{ mt: 0.5 }}
          >
            {RAIL_TYPES.map((r) => (
              <MenuItem key={r} value={r}>
                {r === 'auto' ? 'Auto (recommended)' : `DIN 536 ${r} (head ${DIN536[r].headWidth} mm)`}
              </MenuItem>
            ))}
          </TextField>
        </Box>
      </Section>

      <Section title="Options" defaultExpanded={false}>
        <TextField
          label="Notes"
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          multiline
          minRows={3}
          fullWidth
          inputProps={{ maxLength: 2000 }}
          helperText="Saved with the design. Not printed on the drawing."
        />
      </Section>
    </Stack>
  );
}
