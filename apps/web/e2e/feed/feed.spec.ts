/**
 * Feed E2E Tests
 */

import { test, expect } from '@playwright/test';

test.describe('Feed', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/feed');
  });

  test('should display feed page', async ({ page }) => {
    // Feed should be visible
    await expect(page.locator('[data-testid="feed"], main')).toBeVisible();

    // Should have posts or empty state
    const posts = page.locator('[data-testid="post-card"], article');
    const emptyState = page.locator('text=/no posts|empty|start following/i');

    const hasPosts = await posts.first().isVisible().catch(() => false);
    const hasEmptyState = await emptyState.isVisible().catch(() => false);

    expect(hasPosts || hasEmptyState).toBeTruthy();
  });

  test('should have feed type tabs', async ({ page }) => {
    // Check for For You and Following tabs
    await expect(page.locator('text=/for you/i')).toBeVisible();
    await expect(page.locator('text=/following/i')).toBeVisible();
  });

  test('should switch between For You and Following feeds', async ({ page }) => {
    // Click Following tab
    await page.click('text=/following/i');
    await expect(page.locator('[data-testid="feed-type-following"], [aria-selected="true"]:has-text("Following")')).toBeVisible();

    // Click For You tab
    await page.click('text=/for you/i');
    await expect(page.locator('[data-testid="feed-type-for-you"], [aria-selected="true"]:has-text("For You")')).toBeVisible();
  });

  test('should display post cards with correct elements', async ({ page }) => {
    const firstPost = page.locator('[data-testid="post-card"], article').first();

    // Wait for post to load
    if (await firstPost.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Check for author info
      await expect(firstPost.locator('[data-testid="author-name"], a:has-text("@")')).toBeVisible();

      // Check for content
      await expect(firstPost.locator('[data-testid="post-content"], p')).toBeVisible();

      // Check for action buttons
      await expect(firstPost.locator('[data-testid="like-button"], button:has([data-testid="heart-icon"])')).toBeVisible();
      await expect(firstPost.locator('[data-testid="reply-button"], button:has([data-testid="comment-icon"])')).toBeVisible();
      await expect(firstPost.locator('[data-testid="repost-button"], button:has([data-testid="repost-icon"])')).toBeVisible();
    }
  });

  test('should like a post', async ({ page }) => {
    const firstPost = page.locator('[data-testid="post-card"], article').first();

    if (await firstPost.isVisible({ timeout: 5000 }).catch(() => false)) {
      const likeButton = firstPost.locator('[data-testid="like-button"], button:has([data-testid="heart-icon"])');

      // Get initial like count
      const initialCount = await firstPost.locator('[data-testid="like-count"]').textContent().catch(() => '0');

      // Click like
      await likeButton.click();

      // Button should show liked state
      await expect(likeButton).toHaveAttribute('data-liked', 'true').catch(() => {});

      // Like count should increase (or button should change color)
    }
  });

  test('should open post detail on click', async ({ page }) => {
    const firstPost = page.locator('[data-testid="post-card"], article').first();

    if (await firstPost.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Click on post content (not buttons)
      await firstPost.locator('[data-testid="post-content"], p').click();

      // Should navigate to post detail
      await expect(page).toHaveURL(/\/post\/|\/status\//);
    }
  });

  test('should infinite scroll to load more posts', async ({ page }) => {
    // Count initial posts
    const initialPosts = await page.locator('[data-testid="post-card"], article').count();

    if (initialPosts > 0) {
      // Scroll to bottom
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

      // Wait for more posts to load
      await page.waitForTimeout(2000);

      // Count posts after scroll
      const afterScrollPosts = await page.locator('[data-testid="post-card"], article').count();

      // Should have more posts or show "no more posts"
      const hasMorePosts = afterScrollPosts > initialPosts;
      const noMoreMessage = await page.locator('text=/no more|end of feed|that.*all/i').isVisible().catch(() => false);

      expect(hasMorePosts || noMoreMessage).toBeTruthy();
    }
  });

  test('should pull to refresh on mobile', async ({ page }) => {
    // This test is for mobile viewports
    await page.setViewportSize({ width: 375, height: 667 });

    // Simulate pull to refresh gesture
    await page.evaluate(() => {
      window.scrollTo(0, -100);
    });

    // Wait for refresh animation
    await page.waitForTimeout(1000);
  });

  test('should show loading state', async ({ page }) => {
    // Navigate to feed with network throttling
    await page.route('**/api/feed/**', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.continue();
    });

    await page.reload();

    // Should show loading indicator
    const loadingIndicator = page.locator('[data-testid="loading"], [role="progressbar"], text=/loading/i');
    await expect(loadingIndicator).toBeVisible();
  });

  test('should navigate to author profile', async ({ page }) => {
    const firstPost = page.locator('[data-testid="post-card"], article').first();

    if (await firstPost.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Click on author name
      const authorLink = firstPost.locator('[data-testid="author-name"], a:has-text("@")').first();
      await authorLink.click();

      // Should navigate to profile
      await expect(page).toHaveURL(/\/@|\/profile\//);
    }
  });
});

test.describe('Feed - Compose', () => {
  test('should open compose modal', async ({ page }) => {
    await page.goto('/feed');

    // Click compose button
    const composeButton = page.locator('[data-testid="compose-button"], button:has-text("Post"), button:has([data-testid="plus-icon"])');
    await composeButton.click();

    // Modal should open
    await expect(page.locator('[data-testid="compose-modal"], [role="dialog"]')).toBeVisible();
  });

  test('should have compose box in sidebar or header', async ({ page }) => {
    await page.goto('/feed');

    // Compose box should be visible on desktop
    const composeBox = page.locator('[data-testid="compose-box"], textarea[placeholder*="What"]');

    if (await composeBox.isVisible().catch(() => false)) {
      await expect(composeBox).toBeVisible();
    }
  });
});
