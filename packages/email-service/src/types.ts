export interface Email {
  id: string;
  to: EmailRecipient | EmailRecipient[];
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
  from: EmailRecipient;
  replyTo?: EmailRecipient;
  subject: string;
  html: string;
  text?: string;
  templateId?: string;
  templateData?: Record<string, unknown>;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
  tags?: string[];
  metadata?: Record<string, string>;
  category: EmailCategory;
  priority: EmailPriority;
  scheduledAt?: Date;
  createdAt: Date;
  sentAt?: Date;
  status: EmailStatus;
  providerMessageId?: string;
}

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
  contentId?: string;
  disposition?: 'attachment' | 'inline';
}

export type EmailCategory =
  | 'transactional'
  | 'notification'
  | 'marketing'
  | 'digest'
  | 'security'
  | 'welcome'
  | 'password_reset'
  | 'verification'
  | 'invitation';

export type EmailPriority = 'high' | 'normal' | 'low';

export type EmailStatus =
  | 'pending'
  | 'scheduled'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'complained'
  | 'failed';

export interface EmailTemplate {
  id: string;
  name: string;
  description?: string;
  category: EmailCategory;
  subject: string;
  mjml?: string;
  html: string;
  text?: string;
  variables: TemplateVariable[];
  preheader?: string;
  version: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  defaultValue?: unknown;
  description?: string;
}

export interface EmailEvent {
  id: string;
  emailId: string;
  type: EmailEventType;
  timestamp: Date;
  data?: Record<string, unknown>;
  userAgent?: string;
  ipAddress?: string;
  link?: string;
}

export type EmailEventType =
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'dropped'
  | 'deferred'
  | 'complained'
  | 'unsubscribed';

export interface BounceInfo {
  type: 'hard' | 'soft' | 'block';
  code?: string;
  message: string;
  timestamp: Date;
}

export interface EmailPreferences {
  userId: string;
  email: string;
  globalUnsubscribe: boolean;
  categories: {
    [K in EmailCategory]?: boolean;
  };
  frequency?: 'realtime' | 'daily_digest' | 'weekly_digest';
  timezone?: string;
  updatedAt: Date;
}

export interface EmailStats {
  period: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  complaintRate: number;
  byCategory: Record<EmailCategory, {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
  }>;
}

export interface SendGridConfig {
  apiKey: string;
  sandboxMode?: boolean;
}

export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  pool?: boolean;
  maxConnections?: number;
}

export interface EmailConfig {
  provider: 'sendgrid' | 'smtp';
  sendgrid?: SendGridConfig;
  smtp?: SMTPConfig;
  defaultFrom: EmailRecipient;
  replyTo?: EmailRecipient;
  trackOpens?: boolean;
  trackClicks?: boolean;
  batchSize: number;
  retryAttempts: number;
  retryDelay: number;
}

export interface DigestConfig {
  userId: string;
  frequency: 'daily' | 'weekly';
  categories: EmailCategory[];
  timezone: string;
  deliveryHour: number;
  deliveryDayOfWeek?: number;
}

export interface DigestContent {
  userId: string;
  items: DigestItem[];
  period: {
    start: Date;
    end: Date;
  };
}

export interface DigestItem {
  type: string;
  title: string;
  description?: string;
  url?: string;
  imageUrl?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}
