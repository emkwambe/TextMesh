import Handlebars from 'handlebars';
import mjml2html from 'mjml';
import { convert } from 'html-to-text';
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  EmailTemplate,
  TemplateVariable,
  EmailCategory,
} from './types';

export class TemplateEngine {
  private redis: Redis;
  private compiledTemplates: Map<string, HandlebarsTemplateDelegate> = new Map();
  private readonly templatePrefix = 'email:template:';

  constructor(redis: Redis) {
    this.redis = redis;
    this.registerHelpers();
  }

  private registerHelpers(): void {
    Handlebars.registerHelper('formatDate', (date: Date, format: string) => {
      const d = new Date(date);
      const formats: Record<string, string> = {
        short: d.toLocaleDateString(),
        long: d.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        time: d.toLocaleTimeString(),
        full: d.toLocaleString(),
        iso: d.toISOString(),
      };
      return formats[format] || formats.short;
    });

    Handlebars.registerHelper('formatNumber', (num: number, decimals: number = 0) => {
      return num.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    });

    Handlebars.registerHelper('truncate', (str: string, length: number) => {
      if (str.length <= length) return str;
      return str.substring(0, length) + '...';
    });

    Handlebars.registerHelper('uppercase', (str: string) => str.toUpperCase());
    Handlebars.registerHelper('lowercase', (str: string) => str.toLowerCase());
    Handlebars.registerHelper('capitalize', (str: string) => {
      return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    });

    Handlebars.registerHelper('if_eq', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
      return a === b ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper('if_gt', function (this: unknown, a: number, b: number, options: Handlebars.HelperOptions) {
      return a > b ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper('pluralize', (count: number, singular: string, plural: string) => {
      return count === 1 ? singular : plural;
    });

    Handlebars.registerHelper('json', (obj: unknown) => {
      return JSON.stringify(obj);
    });
  }

  async createTemplate(
    name: string,
    category: EmailCategory,
    subject: string,
    content: { mjml?: string; html?: string; text?: string },
    variables: TemplateVariable[],
    options: {
      description?: string;
      preheader?: string;
    } = {}
  ): Promise<EmailTemplate> {
    let html = content.html || '';

    if (content.mjml) {
      const result = mjml2html(content.mjml, {
        validationLevel: 'soft',
        minify: true,
      });

      if (result.errors.length > 0) {
        const errors = result.errors.map((e) => e.formattedMessage).join('\n');
        throw new Error(`MJML compilation errors:\n${errors}`);
      }

      html = result.html;
    }

    const text = content.text || this.generateTextVersion(html);

    const template: EmailTemplate = {
      id: uuidv4(),
      name,
      description: options.description,
      category,
      subject,
      mjml: content.mjml,
      html,
      text,
      variables,
      preheader: options.preheader,
      version: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.saveTemplate(template);
    this.compileTemplate(template);

    return template;
  }

  async updateTemplate(
    templateId: string,
    updates: Partial<Pick<EmailTemplate, 'name' | 'subject' | 'html' | 'mjml' | 'text' | 'variables' | 'preheader' | 'isActive'>>
  ): Promise<EmailTemplate> {
    const template = await this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    let html = updates.html || template.html;

    if (updates.mjml) {
      const result = mjml2html(updates.mjml, {
        validationLevel: 'soft',
        minify: true,
      });

      if (result.errors.length > 0) {
        throw new Error('MJML compilation failed');
      }

      html = result.html;
    }

    const updated: EmailTemplate = {
      ...template,
      ...updates,
      html,
      text: updates.text || (updates.html || updates.mjml ? this.generateTextVersion(html) : template.text),
      version: template.version + 1,
      updatedAt: new Date(),
    };

    await this.saveTemplate(updated);
    this.compiledTemplates.delete(templateId);
    this.compileTemplate(updated);

    return updated;
  }

  async getTemplate(templateId: string): Promise<EmailTemplate | null> {
    const data = await this.redis.get(`${this.templatePrefix}${templateId}`);
    if (!data) return null;
    return this.deserializeTemplate(data);
  }

  async getTemplateByName(name: string): Promise<EmailTemplate | null> {
    const id = await this.redis.get(`${this.templatePrefix}name:${name}`);
    if (!id) return null;
    return this.getTemplate(id);
  }

  async listTemplates(category?: EmailCategory): Promise<EmailTemplate[]> {
    const templates: EmailTemplate[] = [];
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.templatePrefix}????????-????-????-????-????????????`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const template = this.deserializeTemplate(data);
          if (!category || template.category === category) {
            templates.push(template);
          }
        }
      }
    } while (cursor !== '0');

    return templates.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async deleteTemplate(templateId: string): Promise<boolean> {
    const template = await this.getTemplate(templateId);
    if (!template) return false;

    await this.redis.del(`${this.templatePrefix}${templateId}`);
    await this.redis.del(`${this.templatePrefix}name:${template.name}`);
    this.compiledTemplates.delete(templateId);

    return true;
  }

  render(
    template: EmailTemplate,
    data: Record<string, unknown>
  ): { subject: string; html: string; text: string } {
    this.validateData(template, data);

    let compiledSubject = this.compiledTemplates.get(`${template.id}:subject`);
    let compiledHtml = this.compiledTemplates.get(`${template.id}:html`);
    let compiledText = this.compiledTemplates.get(`${template.id}:text`);

    if (!compiledSubject || !compiledHtml || !compiledText) {
      this.compileTemplate(template);
      compiledSubject = this.compiledTemplates.get(`${template.id}:subject`)!;
      compiledHtml = this.compiledTemplates.get(`${template.id}:html`)!;
      compiledText = this.compiledTemplates.get(`${template.id}:text`)!;
    }

    const templateData = this.prepareData(template, data);

    return {
      subject: compiledSubject(templateData),
      html: this.injectPreheader(compiledHtml(templateData), template.preheader),
      text: compiledText(templateData),
    };
  }

  renderString(templateString: string, data: Record<string, unknown>): string {
    const compiled = Handlebars.compile(templateString);
    return compiled(data);
  }

  private compileTemplate(template: EmailTemplate): void {
    this.compiledTemplates.set(
      `${template.id}:subject`,
      Handlebars.compile(template.subject)
    );
    this.compiledTemplates.set(
      `${template.id}:html`,
      Handlebars.compile(template.html)
    );
    this.compiledTemplates.set(
      `${template.id}:text`,
      Handlebars.compile(template.text || '')
    );
  }

  private validateData(
    template: EmailTemplate,
    data: Record<string, unknown>
  ): void {
    for (const variable of template.variables) {
      if (variable.required && !(variable.name in data)) {
        throw new Error(`Missing required variable: ${variable.name}`);
      }

      if (variable.name in data) {
        const value = data[variable.name];
        const actualType = Array.isArray(value) ? 'array' : typeof value;

        if (actualType !== variable.type && value !== null && value !== undefined) {
          if (!(variable.type === 'number' && !isNaN(Number(value)))) {
            throw new Error(
              `Invalid type for ${variable.name}: expected ${variable.type}, got ${actualType}`
            );
          }
        }
      }
    }
  }

  private prepareData(
    template: EmailTemplate,
    data: Record<string, unknown>
  ): Record<string, unknown> {
    const prepared: Record<string, unknown> = { ...data };

    for (const variable of template.variables) {
      if (!(variable.name in prepared) && variable.defaultValue !== undefined) {
        prepared[variable.name] = variable.defaultValue;
      }
    }

    prepared.currentYear = new Date().getFullYear();
    prepared.companyName = 'TextMesh';
    prepared.supportEmail = 'support@textmesh.com';
    prepared.unsubscribeUrl = prepared.unsubscribeUrl || '#';

    return prepared;
  }

  private injectPreheader(html: string, preheader?: string): string {
    if (!preheader) return html;

    const preheaderHtml = `
      <div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
        ${preheader}
        ${'&nbsp;'.repeat(100)}
      </div>
    `;

    return html.replace(/<body[^>]*>/i, (match) => match + preheaderHtml);
  }

  private generateTextVersion(html: string): string {
    return convert(html, {
      wordwrap: 80,
      selectors: [
        { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
        { selector: 'img', format: 'skip' },
      ],
    });
  }

  private async saveTemplate(template: EmailTemplate): Promise<void> {
    await this.redis.set(
      `${this.templatePrefix}${template.id}`,
      JSON.stringify(template)
    );
    await this.redis.set(
      `${this.templatePrefix}name:${template.name}`,
      template.id
    );
  }

  private deserializeTemplate(data: string): EmailTemplate {
    const template = JSON.parse(data);
    template.createdAt = new Date(template.createdAt);
    template.updatedAt = new Date(template.updatedAt);
    return template;
  }
}
