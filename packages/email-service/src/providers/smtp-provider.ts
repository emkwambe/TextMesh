import nodemailer from 'nodemailer';
import {
  Email,
  EmailRecipient,
  SMTPConfig,
} from '../types';

export class SMTPProvider {
  private transporter: nodemailer.Transporter;

  constructor(config: SMTPConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
      pool: config.pool,
      maxConnections: config.maxConnections,
    } as nodemailer.TransportOptions);
  }

  async send(email: Email): Promise<{ messageId: string; success: boolean }> {
    const recipients = Array.isArray(email.to) ? email.to : [email.to];

    const mailOptions: nodemailer.SendMailOptions = {
      from: this.formatRecipient(email.from),
      to: recipients.map(this.formatRecipient).join(', '),
      cc: email.cc?.map(this.formatRecipient).join(', '),
      bcc: email.bcc?.map(this.formatRecipient).join(', '),
      replyTo: email.replyTo ? this.formatRecipient(email.replyTo) : undefined,
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: email.headers,
      attachments: email.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
        cid: attachment.contentId,
        contentDisposition: attachment.disposition,
      })),
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);

      return {
        messageId: result.messageId,
        success: true,
      };
    } catch (error) {
      throw error instanceof Error ? error : new Error('SMTP send failed');
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

    for (const email of emails) {
      try {
        const result = await this.send(email);
        results.push({
          emailId: email.id,
          messageId: result.messageId,
          success: true,
        });
      } catch (error) {
        results.push({
          emailId: email.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  async verify(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }

  private formatRecipient(recipient: EmailRecipient): string {
    if (recipient.name) {
      return `"${recipient.name}" <${recipient.email}>`;
    }
    return recipient.email;
  }

  close(): void {
    this.transporter.close();
  }
}
