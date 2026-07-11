import { expect, test } from '@playwright/test';

test('selects the unknown-device candidate and explains the evidence', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Interview room' })).toBeVisible();
  await page.getByRole('button', { name: /unknown device name/i }).click();
  await expect(page.getByText('Candidate identified')).toBeVisible();
  await expect(page.getByText('Explicit self-identification')).toBeVisible();
});

test('leaves close candidates unassigned', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /ambiguous guests/i }).click();
  await expect(page.getByText('No participant target')).toBeVisible();
  await expect(page.getByText('Needs review')).toBeVisible();
});
