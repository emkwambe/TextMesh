/**
 * Spam Filtering Service
 *
 * Microservice for spam detection and filtering
 */

import express from 'express';
import { createLogger } from '@textmesh/logger';
import { v4 as uuidv4 } from 'uuid';
import { spamFilterService, SpamFilterService } from './services/spam-filter.service';
import { SpamFilterRequest, ContentSource } from './types';

const logger = createLogger({ service: 'spam-filtering-service', level: 'info' });
const app = express();

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'spam-filtering-service' });
});

// Filter content
app.post('/filter', async (req, res) => {
  try {
    const {
      contentId,
      contentType,
      content,
      authorId,
      urls,
      metadata,
    } = req.body;

    if (!contentId || !contentType || !content || !authorId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const request: SpamFilterRequest = {
      id: uuidv4(),
      contentId,
      contentType: contentType as ContentSource,
      content,
      authorId,
      urls,
      metadata,
      timestamp: new Date(),
    };

    const result = await spamFilterService.filter(request);
    res.json(result);
  } catch (error) {
    logger.error('Filter error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Batch filter
app.post('/filter/batch', async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Items must be an array' });
    }

    const requests: SpamFilterRequest[] = items.map((item: Record<string, unknown>) => ({
      id: uuidv4(),
      contentId: item.contentId as string,
      contentType: item.contentType as ContentSource,
      content: item.content as string,
      authorId: item.authorId as string,
      urls: item.urls as string[],
      metadata: item.metadata as Record<string, unknown>,
      timestamp: new Date(),
    }));

    const results = await spamFilterService.batchFilter(requests);
    res.json({ results });
  } catch (error) {
    logger.error('Batch filter error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Submit report
app.post('/reports', async (req, res) => {
  try {
    const { contentId, contentType, reporterId, authorId, reason, details } = req.body;

    if (!contentId || !contentType || !reporterId || !authorId || !reason) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const report = await spamFilterService.submitReport(
      contentId,
      contentType as ContentSource,
      reporterId,
      authorId,
      reason,
      details
    );

    res.status(201).json(report);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('already reported')) {
      return res.status(409).json({ error: errorMessage });
    }
    logger.error('Report submission error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Resolve report
app.patch('/reports/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status, resolvedBy } = req.body;

    if (!status || !resolvedBy) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const report = await spamFilterService.resolveReport(reportId, status, resolvedBy);

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json(report);
  } catch (error) {
    logger.error('Report resolution error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get quarantine queue
app.get('/quarantine', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const items = spamFilterService.getQuarantineService().getPendingReview(limit);
  res.json({ items, count: items.length });
});

// Release from quarantine
app.post('/quarantine/:id/release', async (req, res) => {
  try {
    const { id } = req.params;
    const { reviewerId } = req.body;

    if (!reviewerId) {
      return res.status(400).json({ error: 'Missing reviewerId' });
    }

    const item = await spamFilterService.getQuarantineService().release(id, reviewerId);

    if (!item) {
      return res.status(404).json({ error: 'Quarantine item not found' });
    }

    res.json(item);
  } catch (error) {
    logger.error('Quarantine release error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete from quarantine
app.delete('/quarantine/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { reviewerId } = req.body;

    if (!reviewerId) {
      return res.status(400).json({ error: 'Missing reviewerId' });
    }

    const item = await spamFilterService.getQuarantineService().delete(id, reviewerId);

    if (!item) {
      return res.status(404).json({ error: 'Quarantine item not found' });
    }

    res.json(item);
  } catch (error) {
    logger.error('Quarantine delete error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get author stats
app.get('/authors/:authorId/stats', (req, res) => {
  const { authorId } = req.params;
  const stats = spamFilterService.getReportService().getAuthorStats(authorId);

  if (!stats) {
    return res.status(404).json({ error: 'Author stats not found' });
  }

  res.json(stats);
});

// Ban author
app.post('/authors/:authorId/ban', (req, res) => {
  const { authorId } = req.params;
  spamFilterService.getReportService().banAuthor(authorId);
  res.json({ success: true, message: 'Author banned' });
});

// Unban author
app.post('/authors/:authorId/unban', (req, res) => {
  const { authorId } = req.params;
  spamFilterService.getReportService().unbanAuthor(authorId);
  res.json({ success: true, message: 'Author unbanned' });
});

// Get statistics
app.get('/stats', (req, res) => {
  const stats = spamFilterService.getStats();
  res.json(stats);
});

// Train classifier
app.post('/train', (req, res) => {
  const { text, isSpam } = req.body;

  if (typeof text !== 'string' || typeof isSpam !== 'boolean') {
    return res.status(400).json({ error: 'Invalid training data' });
  }

  spamFilterService.train(text, isSpam);
  res.json({ success: true, message: 'Training example added' });
});

// Manage patterns
app.get('/patterns', (req, res) => {
  const patterns = spamFilterService.getPatterns();
  res.json({ patterns });
});

app.post('/patterns', (req, res) => {
  const pattern = req.body;

  if (!pattern.id || !pattern.pattern || !pattern.type || !pattern.category) {
    return res.status(400).json({ error: 'Missing required pattern fields' });
  }

  spamFilterService.addPattern({
    ...pattern,
    enabled: pattern.enabled ?? true,
    severity: pattern.severity || 'medium',
    hitCount: 0,
    createdAt: new Date(),
  });

  res.status(201).json({ success: true, pattern });
});

app.delete('/patterns/:patternId', (req, res) => {
  const { patternId } = req.params;
  spamFilterService.removePattern(patternId);
  res.json({ success: true, message: 'Pattern removed' });
});

// Configuration
app.get('/config', (req, res) => {
  const config = spamFilterService.getConfig();
  res.json(config);
});

app.patch('/config', (req, res) => {
  const updates = req.body;
  spamFilterService.updateConfig(updates);
  res.json({ success: true, config: spamFilterService.getConfig() });
});

// Start server
const PORT = process.env.PORT || 3010;

app.listen(PORT, () => {
  logger.info(`Spam filtering service started on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Shutting down spam filtering service');
  await spamFilterService.cleanup();
  process.exit(0);
});

export { app, spamFilterService };
export * from './types';
export * from './services/spam-filter.service';
export * from './services/quarantine.service';
export * from './services/report.service';
