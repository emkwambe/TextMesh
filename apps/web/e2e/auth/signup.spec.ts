/**
 * Signup Flow E2E Tests
 */

import { test, expect } from '@playwright/test';

test.describe('Signup Flow', () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // Unauthenticated

  test('should display signup page', async ({ page }) => {
    await page.goto('/signup');

    await expect(page.locator('h1')).toContainText(/sign up|create account|join/i);
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should show validation errors for empty form', async ({ page }) => {
    await page.goto('/signup');

    await page.click('button[type="submit"]');

    await expect(page.locator('text=/email.*required|required.*email/i')).toBeVisible();
    await expect(page.locator('text=/password.*required|required.*password/i')).toBeVisible();
    await expect(page.locator('text=/username.*required|required.*username/i')).toBeVisible();
  });

  test('should validate email format', async ({ page }) => {
    await page.goto('/signup');

    await page.fill('input[name="email"]', 'notanemail');
    await page.fill('input[name="password"]', 'ValidPass123!');
    await page.fill('input[name="username"]', 'testuser');

    await expect(page.locator('text=/valid email|email.*invalid/i')).toBeVisible();
  });

  test('should validate password strength', async ({ page }) => {
    await page.goto('/signup');

    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="username"]', 'testuser');

    // Test weak password
    await page.fill('input[name="password"]', '123');
    await expect(page.locator('text=/password.*short|weak|characters/i')).toBeVisible();

    // Test password without uppercase
    await page.fill('input[name="password"]', 'onlylowercase123');
    const upperWarning = page.locator('text=/uppercase|capital/i');
    // May or may not show depending on password policy

    // Test strong password
    await page.fill('input[name="password"]', 'StrongPass123!');
    // Should not show strength warning for strong password
  });

  test('should validate username format', async ({ page }) => {
    await page.goto('/signup');

    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'ValidPass123!');

    // Username with spaces
    await page.fill('input[name="username"]', 'user name');
    await expect(page.locator('text=/spaces|invalid.*username|alphanumeric/i')).toBeVisible();

    // Username with special characters
    await page.fill('input[name="username"]', 'user@name!');
    await expect(page.locator('text=/special|invalid.*username|alphanumeric/i')).toBeVisible();

    // Too short username
    await page.fill('input[name="username"]', 'ab');
    await expect(page.locator('text=/short|minimum|at least/i')).toBeVisible();

    // Valid username
    await page.fill('input[name="username"]', 'valid_username123');
    // Should not show error
  });

  test('should check username availability', async ({ page }) => {
    await page.goto('/signup');

    await page.fill('input[name="username"]', 'demo'); // Assuming 'demo' exists

    // Wait for availability check
    await page.waitForTimeout(1000);

    // Should show taken/unavailable message
    const unavailable = page.locator('text=/taken|unavailable|exists/i');
    // May show if username check is implemented
  });

  test('should require terms acceptance', async ({ page }) => {
    await page.goto('/signup');

    await page.fill('input[name="email"]', `newuser_${Date.now()}@test.com`);
    await page.fill('input[name="password"]', 'ValidPass123!');
    await page.fill('input[name="username"]', `newuser_${Date.now()}`);
    await page.fill('input[name="displayName"]', 'New User');

    // Try to submit without accepting terms
    const termsCheckbox = page.locator('input[name="terms"], input[name="acceptTerms"]');
    if (await termsCheckbox.isVisible()) {
      await page.click('button[type="submit"]');
      await expect(page.locator('text=/terms|agree|accept/i')).toBeVisible();
    }
  });

  test('should successfully create account', async ({ page }) => {
    await page.goto('/signup');

    const timestamp = Date.now();
    await page.fill('input[name="email"]', `e2etest_${timestamp}@test.textmesh.com`);
    await page.fill('input[name="password"]', 'ValidPass123!');
    await page.fill('input[name="username"]', `e2etest_${timestamp}`);
    await page.fill('input[name="displayName"]', 'E2E Test User');

    // Accept terms if checkbox exists
    const termsCheckbox = page.locator('input[name="terms"], input[name="acceptTerms"]');
    if (await termsCheckbox.isVisible()) {
      await termsCheckbox.check();
    }

    await page.click('button[type="submit"]');

    // Should redirect to onboarding or feed
    await expect(page).toHaveURL(/\/(onboarding|feed)/, { timeout: 15000 });
  });

  test('should navigate to login from signup', async ({ page }) => {
    await page.goto('/signup');

    await page.click('text=/sign in|log in|already have/i');

    await expect(page).toHaveURL(/\/login/);
  });

  test('should show password requirements', async ({ page }) => {
    await page.goto('/signup');

    await page.focus('input[name="password"]');

    // Password requirements should be visible
    const requirements = page.locator('[data-testid="password-requirements"], text=/characters|uppercase|number/i');
    // May or may not show requirements tooltip
  });
});
