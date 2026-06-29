import { test, expect } from '@playwright/test';

test.describe('Auth', () => {
  test('login flow', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/login/);

    // Fill credentials
    await page.fill('input[type="email"], input[name="email"]', 'test@nexus.com');
    await page.fill('input[type="password"], input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await page.waitForURL('**/');
    await expect(page).toHaveURL(/\/$/);
  });
});
