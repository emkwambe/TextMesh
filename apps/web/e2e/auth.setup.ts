/**
 * Authentication Setup for Playwright Tests
 *
 * This file handles authentication for e2e tests.
 * It runs before the main test suite and saves the authenticated state.
 */

import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../playwright/.auth/user.json');

setup('authenticate', async ({ page }) => {
  // Navigate to login page
  await page.goto('/login');

  // Fill in login credentials
  await page.fill('input[name="email"]', 'demo@textmesh.com');
  await page.fill('input[name="password"]', 'password123');

  // Click login button
  await page.click('button[type="submit"]');

  // Wait for successful login - should redirect to feed
  await expect(page).toHaveURL(/\/feed/, { timeout: 10000 });

  // Verify we're logged in by checking for user menu
  await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();

  // Save signed-in state to file
  await page.context().storageState({ path: authFile });
});

setup('create test user if needed', async ({ request }) => {
  // This setup creates a test user if it doesn't exist
  try {
    const response = await request.post('/api/auth/register', {
      data: {
        email: 'e2e-test@textmesh.com',
        password: 'TestPass123!',
        username: 'e2etest',
        displayName: 'E2E Test User',
      },
    });

    // User created or already exists
    if (response.status() === 201 || response.status() === 409) {
      console.log('Test user ready');
    }
  } catch (error) {
    // Ignore errors - user might already exist
  }
});
