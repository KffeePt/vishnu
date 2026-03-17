import { test, expect } from '@playwright/test';

test.describe('Dashboard Smoke Tests', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Dashboard|Login|Vishnu|Graviton/i);
  });

  test('unauthenticated redirect to login for admin', async ({ page }) => {
    await page.goto('/admin');
    // Should redirect to login
    await expect(page).toHaveURL(/.*\/login/);
  });

  test('landing page is public and renders', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/Graviton Systems/i);
  });
});
