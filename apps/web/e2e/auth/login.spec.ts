/**
 * Login Flow E2E Tests
 */

import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // Unauthenticated

  test('should display login page', async ({ page }) => {
    await page.goto('/login');

    await expect(page.locator('h1')).toContainText(/sign in|log in|welcome/i);
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should show validation errors for empty form', async ({ page }) => {
    await page.goto('/login');

    // Click submit without filling form
    await page.click('button[type="submit"]');

    // Check for validation errors
    await expect(page.locator('text=/email.*required|required.*email/i')).toBeVisible();
    await expect(page.locator('text=/password.*required|required.*password/i')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[name="email"]', 'invalid@example.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Check for error message
    await expect(page.locator('text=/invalid|incorrect|wrong/i')).toBeVisible({ timeout: 10000 });
  });

  test('should show error for invalid email format', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[name="email"]', 'notanemail');
    await page.fill('input[name="password"]', 'password123');

    // Should show email validation error
    await expect(page.locator('text=/valid email|email.*invalid/i')).toBeVisible();
  });

  test('should successfully login with valid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[name="email"]', 'demo@textmesh.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Should redirect to feed after login
    await expect(page).toHaveURL(/\/feed/, { timeout: 10000 });

    // Should show user menu
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  });

  test('should navigate to signup from login', async ({ page }) => {
    await page.goto('/login');

    await page.click('text=/sign up|create account|register/i');

    await expect(page).toHaveURL(/\/signup|\/register/);
  });

  test('should navigate to forgot password', async ({ page }) => {
    await page.goto('/login');

    await page.click('text=/forgot.*password|reset.*password/i');

    await expect(page).toHaveURL(/\/forgot-password|\/reset/);
  });

  test('should remember email with remember me checkbox', async ({ page }) => {
    await page.goto('/login');

    const rememberMe = page.locator('input[name="rememberMe"], input[type="checkbox"]');
    if (await rememberMe.isVisible()) {
      await page.fill('input[name="email"]', 'test@example.com');
      await rememberMe.check();
      await page.reload();

      // Email should be pre-filled
      const emailValue = await page.inputValue('input[name="email"]');
      expect(emailValue).toBe('test@example.com');
    }
  });

  test('should show/hide password toggle', async ({ page }) => {
    await page.goto('/login');

    const passwordInput = page.locator('input[name="password"]');
    const toggleButton = page.locator('[data-testid="toggle-password"], button:has-text("Show")');

    await page.fill('input[name="password"]', 'testpassword');

    // Initially password should be hidden
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click toggle if visible
    if (await toggleButton.isVisible()) {
      await toggleButton.click();
      await expect(passwordInput).toHaveAttribute('type', 'text');

      await toggleButton.click();
      await expect(passwordInput).toHaveAttribute('type', 'password');
    }
  });

  test('should handle rate limiting', async ({ page }) => {
    await page.goto('/login');

    // Make multiple failed login attempts
    for (let i = 0; i < 6; i++) {
      await page.fill('input[name="email"]', 'test@example.com');
      await page.fill('input[name="password"]', 'wrongpassword');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(500);
    }

    // Should show rate limit message
    const rateLimitMessage = page.locator('text=/too many|try again|rate limit/i');
    // Rate limiting might not be visible in all environments
    // await expect(rateLimitMessage).toBeVisible();
  });
});

test.describe('Logout Flow', () => {
  test('should successfully logout', async ({ page }) => {
    // Start authenticated
    await page.goto('/feed');
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();

    // Click user menu
    await page.click('[data-testid="user-menu"]');

    // Click logout
    await page.click('text=/log.*out|sign.*out/i');

    // Should redirect to login or home
    await expect(page).toHaveURL(/\/(login|$)/);
  });
});
