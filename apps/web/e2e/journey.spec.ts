import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const spanInput = (page: Page) => page.locator('#field-spanM input:not([type="range"])');
const nameInput = (page: Page) => page.getByRole('textbox', { name: 'Design name' });

async function download(page: Page, format: 'pdf' | 'svg' | 'dxf' | 'png'): Promise<{ name: string; data: Buffer }> {
  await page.getByTestId('export-button').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId(`export-${format}`).click()]);
  const path = await dl.path();
  return { name: dl.suggestedFilename(), data: readFileSync(path) };
}

test('register -> create -> adjust -> save -> reload -> reopen -> edit -> save -> export', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;

  // register a fresh account
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole('tab', { name: 'Register' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a long test password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'My designs' })).toBeVisible();
  await expect(page.getByText('No designs yet')).toBeVisible();

  // create: the first render is already a drawing
  await page.getByTestId('new-design').click();
  await expect(page.getByTestId('drawing-sheet')).toBeVisible();
  await expect(page.getByTestId('saved-chip')).toHaveText('Not saved yet');

  // adjust inputs and name
  await spanInput(page).fill('21');
  await page.locator('#field-liftHeightM input:not([type="range"])').fill('10.5');
  await nameInput(page).fill('E2E paint shop crane');
  await expect(page.getByTestId('dirty-chip')).toBeVisible();
  await expect(page.getByTestId('drawing-sheet').locator('text', { hasText: /^21000$/ })).toHaveCount(1);

  // an invalid value is explained and the drawing is kept, dimmed
  await spanInput(page).fill('99');
  await expect(page.getByTestId('issues-errors')).toContainText('Span must be at most 35 m');
  await expect(page.getByText('Showing the last valid drawing')).toBeVisible();
  await spanInput(page).fill('21');
  await expect(page.getByTestId('issues-errors')).toHaveCount(0);

  // save
  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('saved-chip')).toContainText('rev 1');
  await expect(page).toHaveURL(/\/design\/[a-z0-9]+$/);
  const designUrl = page.url();

  // reload: everything comes back from the database
  await page.reload();
  await expect(nameInput(page)).toHaveValue('E2E paint shop crane');
  await expect(spanInput(page)).toHaveValue('21');
  await expect(page.locator('#field-liftHeightM input:not([type="range"])')).toHaveValue('10.5');

  // list shows it; reopen from the list
  await page.getByRole('link', { name: 'My designs' }).first().click();
  await expect(page.getByRole('button', { name: /^Open E2E paint shop crane/ })).toBeVisible();
  await page.getByRole('button', { name: /^Open E2E paint shop crane/ }).click();
  await expect(page).toHaveURL(designUrl);

  // edit and save again
  await page.locator('#field-craneType').getByRole('button', { name: 'Single girder' }).click();
  await page.locator('#field-capacityT').getByRole('combobox').click();
  await page.getByRole('option', { name: '5 t', exact: true }).click();
  await spanInput(page).fill('15');
  await page.getByRole('button', { name: 'Options' }).click();
  await page.getByLabel('Notes').fill('Revised for the smaller hoist.');
  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('saved-chip')).toContainText('rev 2');

  // dimensions panel links to sources
  await page.getByRole('tab', { name: 'Dimensions' }).click();
  await page.getByTestId('dim-hookApproach').getByRole('button').first().click();
  await expect(page.getByTestId('dim-hookApproach')).toContainText('F-21');

  // export every format; each is a real file
  const pdf = await download(page, 'pdf');
  expect(pdf.name).toMatch(/^E2E-paint-shop-crane-rev2\.pdf$/);
  expect(pdf.data.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.data.length).toBeGreaterThan(5000);

  const svg = await download(page, 'svg');
  expect(svg.data.toString('utf8')).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
  expect(svg.data.toString('utf8')).toContain('E2E paint shop crane');

  const dxf = await download(page, 'dxf');
  expect(dxf.data.toString('utf8')).toContain('SECTION');
  expect(dxf.data.toString('utf8').trimEnd().endsWith('EOF')).toBe(true);

  const png = await download(page, 'png');
  expect(png.data.subarray(1, 4).toString()).toBe('PNG');
  expect(png.data.length).toBeGreaterThan(20_000);

  // delete with confirmation
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByTestId('delete-design').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No designs yet')).toBeVisible();
});

test('demo login shows the seeded cranes and another account cannot open them', async ({ page, browser }) => {
  await page.goto('/login');
  await page.getByTestId('demo-login').click();
  await expect(page.getByRole('button', { name: /^Open Assembly hall/ })).toBeVisible();
  await page.getByRole('button', { name: /^Open Assembly hall/ }).click();
  const url = page.url();

  const other = await browser.newPage();
  await other.goto('/login');
  await other.getByRole('tab', { name: 'Register' }).click();
  await other.getByLabel('Email').fill(`e2e-other-${Date.now()}@example.com`);
  await other.getByLabel('Password').fill('another long password');
  await other.getByRole('button', { name: 'Create account' }).click();
  await expect(other.getByRole('heading', { name: 'My designs' })).toBeVisible();
  await other.goto(url);
  await expect(other.getByText('That design belongs to another account.')).toBeVisible();
  await other.close();
});
