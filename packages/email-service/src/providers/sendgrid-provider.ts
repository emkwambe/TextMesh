import sgMail from '@sendgrid/mail';
import {
  Email,
  EmailRecipient,
  SendGridConfig,
} from '../types';

export class SendGridProvider {
  private sandboxMode: boolean;

  constructor(config: SendGridConfig) {
    sgMail.setApiKey(config.apiKey);
    this.sandboxMode = config.sandboxMode || false;
  }

  async send(email: Email): Promise<{ messageId: string; success: boolean }> {
    const recipients = Array.isArray(email.to) ? email.to : [email.to];

    const message: sgMail.MailDataRequired = {
      to: recipients.map(this.formatRecipient),
      from: this.formatRecipient(email.from),
      subject: email.subject,
      html: email.html,
      text: email.text,
      cc: email.cc?.map(this.formatRecipient),
      bcc: email.bcc?.map(this.formatRecipient),
      replyTo: email.replyTo ? this.formatRecipient(email.replyTo) : undefined,
      headers: email.headers,
      categories: email.tags,
      customArgs: email.metadata,
      attachments: email.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content:
          typeof attachment.content === 'string'
            ? attachment.content
            : attachment.content.toString('base64'),
        type: attachment.contentType,
        contentId: attachment.contentId,
        disposition: attachment.disposition,
      })),
      mailSettings: {
        sandboxMode: {
          enable: this.sandboxMode,
        },
      },
      trackingSettings: {
        clickTracking: {
          enable: true,
          enableText: false,
        },
        openTracking: {
          enable: true,
        },
      },
    };

    try {
      const [response] = await sgMail.send(message);
      const messageId =
        response.headers['x-message-id'] || `sg_${Date.now()}_${email.id}`;

      return {
        messageId,
        success: response.statusCode >= 200 && response.statusCode < 300,
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async sendBatch(
    emails: Email[]
  ): Promise<Array<{ emailId: string; messageId?: string; success: boolean; error?: string }>> {
    const results: Array<{
      emailId: string;
      messageId?: string;
      success: boolean;
      error?: string;
    }> = [];

    const messages: sgMail.MailDataRequired[] = emails.map((email) => {
      const recipients = Array.isArray(email.to) ? email.to : [email.to];
      return {
        to: recipients.map(this.formatRecipient),
        from: this.formatRecipient(email.from),
        subject: email.subject,
        html: email.html,
        text: email.text,
        customArgs: { emailId: email.id },
        mailSettings: {
          sandboxMode: { enable: this.sandboxMode },
        },
      };
    });

    try {
      const [response] = await sgMail.send(messages);

      emails.forEach((email, index) => {
        results.push({
          emailId: email.id,
          messageId: `sg_batch_${Date.now()}_${index}`,
          success: true,
        });
      });
    } catch (error) {
      const normalizedError = this.normalizeError(error);

      emails.forEach((email) => {
        results.push({
          emailId: email.id,
          success: false,
          error: normalizedError.message,
        });
      });
    }

    return results;
  }

  private formatRecipient(recipient: EmailRecipient): { email: string; name?: string } {
    return {
      email: recipient.email,
      name: recipient.name,
    };
  }

  private normalizeError(error: unknown): Error {
    if (error && typeof error === 'object' && 'response' in error) {
      const sgError = error as { response: { body: { errors: Array<{ message: string }> } } };
      const messages = sgError.response?.body?.errors?.map((e) => e.message) || [];
      return new Error(messages.join(', ') || 'SendGrid error');
    }
    return error instanceof Error ? error : new Error('Unknown SendGrid error');
  }
}
