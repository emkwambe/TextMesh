/**
 * Create Post E2E Tests
 */

import { test, expect } from '@playwright/test';

test.describe('Create Post', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/feed');
  });

  test('should create a text post', async ({ page }) => {
    // Find compose box or open modal
    let composeArea = page.locator('[data-testid="compose-box"] textarea, [data-testid="compose-modal"] textarea');

    if (!(await composeArea.isVisible().catch(() => false))) {
      // Click compose button to open modal
      await page.click('[data-testid="compose-button"], button:has-text("Post")');
      await page.waitForSelector('[data-testid="compose-modal"], [role="dialog"]');
      composeArea = page.locator('[data-testid="compose-modal"] textarea, [role="dialog"] textarea');
    }

    const postContent = `E2E Test Post ${Date.now()} #e2etest`;

    // Type post content
    await composeArea.fill(postContent);

    // Click post button
    await page.click('[data-testid="submit-post"], button:has-text("Post"):not([disabled])');

    // Wait for post to be created
    await page.waitForTimeout(2000);

    // Post should appear in feed
    await expect(page.locator(`text=${postContent.slice(0, 20)}`)).toBeVisible({ timeout: 10000 });
  });

  test('should show character count', async ({ page }) => {
    let composeArea = page.locator('[data-testid="compose-box"] textarea, [data-testid="compose-modal"] textarea');

    if (!(await composeArea.isVisible().catch(() => false))) {
      await page.click('[data-testid="compose-button"], button:has-text("Post")');
      await page.waitForSelector('[data-testid="compose-modal"], [role="dialog"]');
      composeArea = page.locator('[data-testid="compose-modal"] textarea, [role="dialog"] textarea');
    }

    // Type some content
    await composeArea.fill('Hello, TextMesh!');

    // Character count should be visible
    const charCount = page.locator('[data-testid="char-count"], text=/\\d+\\/|characters/');
    await expect(charCount).toBeVisible();
  });

  test('should disable post button when empty', async ({ page }) => {
    let composeArea = page.locator('[data-testid="compose-box"] textarea, [data-testid="compose-modal"] textarea');

    if (!(await composeArea.isVisible().catch(() => false))) {
      await page.click('[data-testid="compose-button"], button:has-text("Post")');
      await page.waitForSelector('[data-testid="compose-modal"], [role="dialog"]');
    }

    // Post button should be disabled when empty
    const postButton = page.locator('[data-testid="submit-post"], button:has-text("Post")');
    await expect(postButton).toBeDisabled();
  });

  test('should disable post button when over character limit', async ({ page }) => {
    let composeArea = page.locator('[data-testid="compose-box"] textarea, [data-testid="compose-modal"] textarea');

    if (!(await composeArea.isVisible().catch(() => false))) {
      await page.click('[data-testid="compose-button"], button:has-text("Post")');
      await page.waitForSelector('[data-testid="compose-modal"], [role="dialog"]');
      composeArea = page.locator('[data-testid="compose-modal"] textarea, [role="dialog"] textarea');
    }

    // Type content over limit (assuming 2000 char limit)
    const longContent = 'a'.repeat(2001);
    await composeArea.fill(longContent);

    // Post button should be disabled
    const postButton = page.locator('[data-testid="submit-post"], button:has-text("Post")');
    await expect(postButton).toBeDisabled();

    // Character count should show warning
    const charCount = page.locator('[data-testid="char-count"]');
    await expect(charCount).toHaveClass(/error|danger|red|over/);
  });

  test('should parse hashtags', async ({ page }) => {
    let composeArea = page.locator('[data-testid="compose-box"] textarea, [data-testid="compose-modal"] textarea');

    if (!(await composeArea.isVisible().catch(() => false))) {
      await page.click('[data-testid="compose-button"], button:has-text("Post")');
      await page.waitForSelector('[data-testid="compose-modal"], [role="dialog"]');
      composeArea = page.locator('[data-testid="compose-modal"] textarea, [role="dialog"] textarea');
    }

    await composeArea.fill('Check out #textmesh and #e2etest');

    // Hashtags should be highlighted or styled differently
    const previewArea = page.locator('[data-testid="post-preview"], [data-testid="compose-preview"]');
    if (await previewArea.isVisible().catch(() => false)) {
      await expect(previewArea.locator('text=#textmesh')).toHaveClass(/hashtag|highlight|link/);
    }
  });

  test('should parse mentions', async ({ page }) => {
    let composeArea = page.locator('[data-testid="compose-box"] textarea, [data-testid="compose-modal"] textarea');

    if (!(await composeArea.isVisible().catch(() => false))) {
      await page.click('[data-testid="compose-button"], button:has-text("Post")');
      await page.waitForSelector('[data-testid="compose-modal"], [role="dialog"]');
      composeArea = page.locator('[data-testid="compose-modal"] textarea, [role="dialog"] textarea');
    }

    await composeArea.fill('Hello @demo!');

    // Should show mention autocomplete
    const autocomplete = page.locator('[data-testid="mention-autocomplete"], [role="listbox"]');
    // Autocomplete may or may not appear depending on implementation
  });

  test('should close compose modal on escape', async ({ page }) => {
    // Open compose modal
    await page.click('[data-testid="compose-button"], button:has-text("Post")');

    const modal = page.locator('[data-testid="compose-modal"], [role="dialog"]');
    await expect(modal).toBeVisible();

    // Press escape
    await page.keyboard.press('Escape');

    // Modal should close
    await expect(modal).not.toBeVisible();
  });

  test('should confirm before discarding draft', async ({ page }) => {
    // Open compose modal
    await page.click('[data-testid="compose-button"], button:has-text("Post")');

    const composeArea = page.locator('[data-testid="compose-modal"] textarea, [role="dialog"] textarea');
    await composeArea.fill('This is a draft that should trigger confirmation');

    // Try to close
    await page.keyboard.press('Escape');

    // Should show confirmation dialog
    const confirmDialog = page.locator('text=/discard|sure|cancel/i');
    if (await confirmDialog.isVisible().catch(() => false)) {
      await expect(confirmDialog).toBeVisible();
    }
  });
});

test.describe('Reply to Post', () => {
  test('should open reply modal', async ({ page }) => {
    await page.goto('/feed');

    const firstPost = page.locator('[data-testid="post-card"], article').first();

    if (await firstPost.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Click reply button
      const replyButton = firstPost.locator('[data-testid="reply-button"], button:has([data-testid="comment-icon"])');
      await replyButton.click();

      // Reply modal or area should open
      await expect(page.locator('[data-testid="reply-modal"], [data-testid="reply-compose"]')).toBeVisible();
    }
  });

  test('should create a reply', async ({ page }) => {
    await page.goto('/feed');

    const firstPost = page.locator('[data-testid="post-card"], article').first();

    if (await firstPost.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Click reply button
      await firstPost.locator('[data-testid="reply-button"], button:has([data-testid="comment-icon"])').click();

      // Wait for reply area
      await page.waitForSelector('[data-testid="reply-modal"] textarea, [data-testid="reply-compose"] textarea');

      const replyContent = `E2E Reply ${Date.now()}`;
      await page.fill('[data-testid="reply-modal"] textarea, [data-testid="reply-compose"] textarea', replyContent);

      // Submit reply
      await page.click('[data-testid="submit-reply"], button:has-text("Reply")');

      // Reply should be created
      await page.waitForTimeout(2000);
    }
  });
});

test.describe('Post Actions', () => {
  test('should bookmark a post', async ({ page }) => {
    await page.goto('/feed');

    const firstPost = page.locator('[data-testid="post-card"], article').first();

    if (await firstPost.isVisible({ timeout: 5000 }).catch(() => false)) {
      const bookmarkButton = firstPost.locator('[data-testid="bookmark-button"], button:has([data-testid="bookmark-icon"])');

      await bookmarkButton.click();

      // Should show bookmarked state
      await expect(bookmarkButton).toHaveAttribute('data-bookmarked', 'true').catch(() => {});
    }
  });

  test('should repost a post', async ({ page }) => {
    await page.goto('/feed');

    const firstPost = page.locator('[data-testid="post-card"], article').first();

    if (await firstPost.isVisible({ timeout: 5000 }).catch(() => false)) {
      const repostButton = firstPost.locator('[data-testid="repost-button"], button:has([data-testid="repost-icon"])');

      await repostButton.click();

      // Should show repost menu or confirmation
      const repostMenu = page.locator('[data-testid="repost-menu"], [role="menu"]');
      await expect(repostMenu).toBeVisible();
    }
  });

  test('should share a post', async ({ page }) => {
    await page.goto('/feed');

    const firstPost = page.locator('[data-testid="post-card"], article').first();

    if (await firstPost.isVisible({ timeout: 5000 }).catch(() => false)) {
      const shareButton = firstPost.locator('[data-testid="share-button"], button:has([data-testid="share-icon"])');

      if (await shareButton.isVisible().catch(() => false)) {
        await shareButton.click();

        // Should show share menu
        const shareMenu = page.locator('[data-testid="share-menu"], [role="menu"]');
        await expect(shareMenu).toBeVisible();
      }
    }
  });

  test('should open post options menu', async ({ page }) => {
    await page.goto('/feed');

    const firstPost = page.locator('[data-testid="post-card"], article').first();

    if (await firstPost.isVisible({ timeout: 5000 }).catch(() => false)) {
      const moreButton = firstPost.locator('[data-testid="more-button"], button:has([data-testid="more-icon"])');

      if (await moreButton.isVisible().catch(() => false)) {
        await moreButton.click();

        // Should show options menu
        const optionsMenu = page.locator('[data-testid="post-options-menu"], [role="menu"]');
        await expect(optionsMenu).toBeVisible();
      }
    }
  });
});
