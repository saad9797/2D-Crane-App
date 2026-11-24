import { DEFAULT_INPUTS } from '@crane/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { tokenStore, type Design } from '../api/client';
import { createFakeApi } from '../test/fakeApi';
import { renderEditorAt } from '../test/render';

const spanField = (): HTMLInputElement => within(document.getElementById('field-spanM') as HTMLElement).getByRole('textbox') as HTMLInputElement;
const nameField = (): HTMLInputElement => screen.getByRole('textbox', { name: 'Design name' }) as HTMLInputElement;

const stored = (over: Partial<Design> = {}): Design => ({
  id: 'seed1', name: 'Seeded crane', notes: 'hello', craneType: 'double-girder', capacityT: 10, spanM: 18, inputs: { ...DEFAULT_INPUTS }, schemaVersion: 1,
  revision: 1, createdAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z', ...over,
});

beforeEach(() => {
  tokenStore.set('test-token');
});

describe('editor: create, save, reopen, edit, save', () => {
  it('walks the whole journey against the (fake) API', async () => {
    const api = createFakeApi();
    api.install();
    const user = userEvent.setup();

    // 1. a new design opens with a good default and nothing to save yet
    const first = renderEditorAt('/design/new');
    expect(await screen.findByTestId('drawing-sheet')).toBeInTheDocument();
    expect(nameField().value).toBe('Untitled crane');
    expect(screen.getByTestId('saved-chip')).toHaveTextContent('Not saved yet');

    // 2. adjust inputs and name: it becomes dirty
    await user.clear(spanField());
    await user.type(spanField(), '21');
    await user.clear(nameField());
    await user.type(nameField(), 'Paint shop crane');
    expect(screen.getByTestId('dirty-chip')).toBeInTheDocument();

    // 3. save: POST with the validated inputs, URL moves to the new id, chip says saved
    await user.click(screen.getByTestId('save-button'));
    await waitFor(() => expect(first.router.state.location.pathname).toBe('/design/d1'));
    const post = api.calls.find((c) => c.method === 'POST' && c.path === '/designs');
    expect(post?.body).toMatchObject({ name: 'Paint shop crane', inputs: { spanM: 21, capacityT: 10 } });
    expect(await screen.findByTestId('saved-chip')).toHaveTextContent('rev 1');
    expect(screen.queryByTestId('dirty-chip')).not.toBeInTheDocument();
    first.unmount();

    // 4. reopen from the server: values come back
    renderEditorAt('/design/d1');
    await waitFor(() => expect(nameField().value).toBe('Paint shop crane'));
    expect(spanField().value).toBe('21');

    // 5. edit and save again: PUT carries the revision, revision goes up
    await user.clear(spanField());
    await user.type(spanField(), '22.5');
    await user.click(screen.getByTestId('save-button'));
    await waitFor(() => expect(screen.getByTestId('saved-chip')).toHaveTextContent('rev 2'));
    const put = api.calls.find((c) => c.method === 'PUT');
    expect(put?.body).toMatchObject({ revision: 1, inputs: { spanM: 22.5 } });
    expect(api.designs.get('d1')?.inputs.spanM).toBe(22.5);
  });

  it('does not send invalid inputs: it points at the field instead', async () => {
    const api = createFakeApi();
    api.install();
    const user = userEvent.setup();
    renderEditorAt('/design/new');
    await screen.findByTestId('drawing-sheet');
    await user.clear(spanField());
    await user.type(spanField(), '99');
    await user.click(screen.getByTestId('save-button'));
    expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    expect(await screen.findByText(/Fix the highlighted inputs before saving/)).toBeVisible();
    expect(screen.getByTestId('issues-errors')).toHaveTextContent('Span must be at most 35 m');
    expect(screen.getByTestId('export-button')).toBeDisabled();
  });

  it('keeps showing the last good drawing (dimmed) while inputs are invalid', async () => {
    createFakeApi().install();
    const user = userEvent.setup();
    renderEditorAt('/design/new');
    expect(await screen.findByTestId('drawing-sheet')).toBeInTheDocument();
    await user.clear(spanField());
    await user.type(spanField(), '99');
    expect(await screen.findByText(/Showing the last valid drawing/)).toBeVisible();
    expect(screen.getByTestId('drawing-sheet').querySelector('svg')).not.toBeNull();
  });
});

describe('editor: conflicts and safety', () => {
  it('offers three ways out of a revision conflict and can overwrite', async () => {
    const api = createFakeApi([stored()]);
    api.install();
    const user = userEvent.setup();
    renderEditorAt('/design/seed1');
    await waitFor(() => expect(nameField().value).toBe('Seeded crane'));

    await user.clear(nameField());
    await user.type(nameField(), 'My edit');
    api.conflictNext = stored({ name: 'Edited elsewhere', revision: 2 });
    await user.click(screen.getByTestId('save-button'));

    const dialog = await screen.findByRole('dialog', { name: /changed elsewhere/i });
    expect(within(dialog).getByText(/Revision 2 was saved/)).toBeVisible();
    expect(within(dialog).getByRole('button', { name: /Load the newer version/ })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: /Save mine as a copy/ })).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: /Overwrite with mine/ }));
    await waitFor(() => expect(screen.getByTestId('saved-chip')).toHaveTextContent('rev 3'));
    expect(api.designs.get('seed1')?.name).toBe('My edit');
    expect(api.calls.filter((c) => c.method === 'PUT').at(-1)?.body).toMatchObject({ revision: 2 });
  });

  it('"Load the newer version" replaces my edits with the server copy', async () => {
    const api = createFakeApi([stored()]);
    api.install();
    const user = userEvent.setup();
    renderEditorAt('/design/seed1');
    await waitFor(() => expect(nameField().value).toBe('Seeded crane'));
    await user.type(nameField(), ' (mine)');
    api.conflictNext = stored({ name: 'Newer on server', revision: 2 });
    await user.click(screen.getByTestId('save-button'));
    await user.click(await screen.findByRole('button', { name: /Load the newer version/ }));
    await waitFor(() => expect(nameField().value).toBe('Newer on server'));
    expect(screen.getByTestId('saved-chip')).toHaveTextContent('rev 2');
  });

  it('warns before leaving with unsaved changes and lets you stay', async () => {
    createFakeApi([stored()]).install();
    const user = userEvent.setup();
    const { router } = renderEditorAt('/design/seed1');
    await waitFor(() => expect(nameField().value).toBe('Seeded crane'));
    await user.type(nameField(), '!');
    void router.navigate('/');
    const dialog = await screen.findByRole('dialog', { name: /Leave without saving/ });
    await user.click(within(dialog).getByRole('button', { name: /Stay and keep editing/ }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Leave without saving/ })).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe('/design/seed1');
    expect(nameField().value).toBe('Seeded crane!');
  });

  it('restores an unsaved draft after a reload', async () => {
    createFakeApi([stored()]).install();
    const user = userEvent.setup();
    const first = renderEditorAt('/design/seed1');
    await waitFor(() => expect(nameField().value).toBe('Seeded crane'));
    await user.type(nameField(), ' v2');
    await waitFor(() => expect(sessionStorage.getItem('crane.draft.seed1')).toContain('Seeded crane v2'));
    first.unmount();
    renderEditorAt('/design/seed1');
    await waitFor(() => expect(nameField().value).toBe('Seeded crane v2'));
    expect(screen.getByTestId('dirty-chip')).toBeInTheDocument();
    expect(screen.getByText(/Restored your unsaved changes/)).toBeVisible();
  });

  it('shows a clear message for a design that does not exist', async () => {
    createFakeApi().install();
    renderEditorAt('/design/nope');
    expect(await screen.findByText(/does not exist/)).toBeVisible();
    expect(screen.getByRole('link', { name: /Back to my designs/ })).toBeVisible();
  });
});
