import { DEFAULT_INPUTS, analyze, type CraneInputs } from '@crane/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMemo, useState } from 'react';
import { withProviders } from '../test/render';
import { InputsPanel, type Patch } from './InputsPanel';

/** The panel wired the way the editor wires it: state in, live validation out. */
function Harness({ start = DEFAULT_INPUTS }: { start?: CraneInputs }) {
  const [inputs, setInputs] = useState(start);
  const issues = useMemo(() => analyze(inputs).issues, [inputs]);
  return (
    <InputsPanel
      inputs={inputs}
      issues={issues}
      notes=""
      onNotes={() => {}}
      onChange={(p: Patch) => setInputs((i) => ({ ...i, ...p }))}
      onPreset={(next) => setInputs(next)}
    />
  );
}

const spanInput = (): HTMLInputElement => {
  const box = document.getElementById('field-spanM') as HTMLElement;
  return within(box).getByRole('textbox') as HTMLInputElement;
};

describe('InputsPanel validation display', () => {
  it('shows the range error under the field, marks it invalid and says how to fix it', async () => {
    const user = userEvent.setup();
    render(withProviders(<Harness />));
    expect(spanInput()).toHaveAttribute('aria-invalid', 'false');

    await user.clear(spanInput());
    await user.type(spanInput(), '99');

    expect(spanInput()).toHaveAttribute('aria-invalid', 'true');
    const message = await screen.findByText('Span must be at most 35 m.');
    expect(message).toBeVisible();
    // the helper text is linked to the input for screen readers
    expect(spanInput().getAttribute('aria-describedby')).toBe(message.closest('[id]')?.id);
  });

  it('returns to the normal helper text once the value is valid again', async () => {
    const user = userEvent.setup();
    render(withProviders(<Harness />));
    await user.clear(spanInput());
    await user.type(spanInput(), '99');
    await screen.findByText('Span must be at most 35 m.');
    await user.clear(spanInput());
    await user.type(spanInput(), '24');
    expect(screen.queryByText(/must be at most/)).not.toBeInTheDocument();
    expect(spanInput()).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByText('Rail centre to rail centre, 5 to 35 m.')).toBeVisible();
  });

  it.each([
    ['', 'must be a number'],
    ['abc', 'must be a number'],
    ['12.34', 'steps of 0.1'],
    ['4', 'at least 5 m'],
  ])('rejects "%s" with a readable message', async (typed, expected) => {
    const user = userEvent.setup();
    render(withProviders(<Harness />));
    await user.clear(spanInput());
    if (typed) await user.type(spanInput(), typed);
    expect(await screen.findByText(new RegExp(expected))).toBeVisible();
    expect(spanInput()).toHaveAttribute('aria-invalid', 'true');
  });

  it('keeps what you type, including a trailing decimal point', async () => {
    const user = userEvent.setup();
    render(withProviders(<Harness />));
    await user.clear(spanInput());
    await user.type(spanInput(), '12.');
    expect(spanInput().value).toBe('12.');
  });

  it('shows a cross-field rule on the capacity field with its hint, and a warning without blocking', async () => {
    const user = userEvent.setup();
    render(withProviders(<Harness start={{ ...DEFAULT_INPUTS, craneType: 'single-girder', capacityT: 10 }} />));
    // choose 32 t on a single girder: an error
    await user.click(within(document.getElementById('field-capacityT') as HTMLElement).getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: '32 t' }));
    expect(await screen.findByText(/limited to 20 t here.*switch to a double-girder crane/i)).toBeVisible();

    // choose 20 t: only a warning (valid)
    await user.click(within(document.getElementById('field-capacityT') as HTMLElement).getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: '20 t' }));
    expect(await screen.findByText(/top of what single-girder cranes usually carry/i)).toBeVisible();
  });

  it('switching to double girder switches the low-headroom option off and disables it', async () => {
    const user = userEvent.setup();
    render(withProviders(<Harness start={{ ...DEFAULT_INPUTS, craneType: 'single-girder', capacityT: 5, lowHeadroomHoist: true }} />));
    const toggle = screen.getByRole('checkbox', { name: /low-headroom hoist/i });
    expect(toggle).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Double girder' }));
    expect(screen.getByRole('checkbox', { name: /low-headroom hoist/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /low-headroom hoist/i })).toBeDisabled();
  });

  it('applies a preset', async () => {
    const user = userEvent.setup();
    render(withProviders(<Harness />));
    await user.click(screen.getByTestId('presets-button'));
    await user.click(await screen.findByRole('menuitem', { name: /10 t × 25 m/ }));
    expect(spanInput().value).toBe('25');
  });
});
