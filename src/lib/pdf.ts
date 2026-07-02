import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { colors } from '../theme';
import type { FormSchema, FormSubmission } from '../types';

export async function exportSubmissionToPdf(schema: FormSchema, submission: FormSubmission): Promise<string> {
  const html = buildHtml(schema, submission);
  const { uri } = await Print.printToFileAsync({ html });
  return uri;
}

export async function shareSubmissionPdf(uri: string) {
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
}

function buildHtml(schema: FormSchema, submission: FormSubmission): string {
  const sections = schema.sections.map((section) => `
    <section><h2>${escape(section.title)}</h2>
    ${section.fields.map((field) => {
      const value = submission.values[field.id];
      return `<div class="field"><div class="label">${escape(field.label)}</div><div class="value">${renderValue(value)}</div></div>`;
    }).join('')}
    </section>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>
    * { box-sizing: border-box; } body { font-family: -apple-system, sans-serif; color: ${colors.text}; padding: 36px; font-size: 11pt; }
    h1 { font-size: 18pt; margin: 0 0 4px; } h2 { font-size: 13pt; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 1px solid ${colors.border}; }
    .meta { color: ${colors.textSecondary}; font-size: 9pt; margin-bottom: 18px; }
    .field { margin: 6px 0 12px; } .label { font-weight: 600; color: ${colors.textSecondary}; font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.4px; }
    .value { margin-top: 2px; white-space: pre-wrap; }
  </style></head><body>
    <h1>${escape(schema.title)}</h1>
    <div class="meta">Submitted ${new Date(submission.submittedAt).toLocaleString()} · Schema v${submission.schemaVersion}</div>
    ${sections}
  </body></html>`;
}

function renderValue(v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.map(String).map(escape).join(', ');
  if (typeof v === 'number' && v > 1_000_000_000_000) return new Date(v).toLocaleString();
  return escape(String(v));
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;');
}
