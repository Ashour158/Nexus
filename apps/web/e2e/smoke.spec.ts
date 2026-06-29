import { test, expect } from '@playwright/test';

test.describe('Smoke', () => {
  test('homepage loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/NEXUS|CRM|Dashboard/i);
  });

  test('navigation works', async ({ page }) => {
    await page.goto('/');

    // Navigate to deals
    await page.locator('a[href="/deals"]').click();
    await expect(page).toHaveURL(/deals/);

    // Navigate to contacts
    await page.locator('a[href="/contacts"]').click();
    await expect(page).toHaveURL(/contacts/);

    // Navigate to settings
    await page.locator('a[href="/settings"]').click();
    await expect(page).toHaveURL(/settings/);
  });
});
