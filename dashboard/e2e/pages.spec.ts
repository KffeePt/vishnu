import { test, expect } from '@playwright/test';

test.describe('Page Route Rendering', () => {
  const routes = ['/', '/login', '/admin/employees', '/admin/repo'];

  for (const route of routes) {
    test(`${route} loads without error`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(500);
    });
  }
});
