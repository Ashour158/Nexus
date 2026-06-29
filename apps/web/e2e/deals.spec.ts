import { test, expect } from '@playwright/test';

test.describe('Deals', () => {
  test('deal list loads', async ({ page }) => {
    await page.goto('/deals');
    await expect(page).toHaveURL(/deals/);
    await expect(page.locator('text=Deals')).toBeVisible();
  });

  test('create deal flow', async ({ page }) => {
    await page.goto('/deals/new');
    await expect(page).toHaveURL(/deals\/new/);

    await page.fill('input[name="name"]', 'E2E Test Deal');
    await page.fill('input[name="amount"]', '50000');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/deals/**');
    await expect(page.locator('text=E2E Test Deal')).toBeVisible();
  });
});
