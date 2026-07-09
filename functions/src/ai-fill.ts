/**
 * AI form-fill Cloud Function.
 *
 * The spine of v0.1. Client calls this when a form is about to be opened —
 * Cloud Function gathers context, calls Claude, returns structured FormValues
 * the client can render into the form as "AI auto-filled" defaults.
 *
 * Three endpoints:
 *   aiFillForm        — fill a generic FormSchema with context (used for FLHA)
 *   aiExtractHazards  — voice transcript → hazards + PPE (faster, no schema)
 *   aiAnalyzeReceipt  — receipt photo → structured line items
 *
 * SECRETS:
 *   ANTHROPIC_API_KEY must be set via:
 *     firebase functions:secrets:set ANTHROPIC_API_KEY
 *
 * COST CONTROL:
 *   - Uses Claude Haiku 4.5 by default (cheap, fast, plenty smart for this).
 *   - Sonnet only when the caller explicitly asks for it (e.g. daily log gen).
 *   - All calls have a max_tokens cap.
 *   - Each fill is roughly 0.3¢. A 50-worker company doing 1 FLHA/day each
 *     costs ~$45/month in API fees.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';

import {
  FLHA_SYSTEM_PROMPT,
  buildFlhaUserMessage,
  HAZARD_EXTRACTION_SYSTEM_PROMPT,
  buildHazardExtractionMessage,
  DEFICIENCY_SYSTEM_PROMPT,
  RECEIPT_OCR_SYSTEM_PROMPT,
  DAILY_LOG_SYSTEM_PROMPT,
  WORKLOG_SYSTEM_PROMPT,
  SCAN_SYSTEM_PROMPT,
  ASK_PROJECT_SYSTEM_PROMPT,
} from './ai-prompts';
import { buildContext } from './context';
import type { FormSchema, FormValues } from './shared-types';

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

// Default model — fast, cheap, good enough for structured form-fill.
// Use 'claude-sonnet-4-6' for complex synthesis (daily logs, incident analysis).
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const SONNET_MODEL = 'claude-sonnet-4-6';

// Reusable client per-warm-container.
let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
  }
  return client;
}

// ─────────────────────────────────────────────────────────────────────────
// aiFillForm — generic schema-aware form pre-fill
// ─────────────────────────────────────────────────────────────────────────

interface FillFormRequest {
  schema: FormSchema;
  projectId: string;
  voiceTranscript?: string;
}

interface FillFormResponse {
  values: FormValues;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
}

export const aiFillForm = onCall<FillFormRequest, Promise<FillFormResponse>>(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const { schema, projectId, voiceTranscript } = request.data;
    if (!schema || !projectId) {
      throw new HttpsError('invalid-argument', 'schema and projectId required.');
    }

    // Sanity check: caller must be a member of this project (or admin).
    await assertProjectAccess(request.auth.uid, projectId);

    const context = await buildContext({
      projectId,
      workerUid: request.auth.uid,
    });

    const userMsg = buildFlhaUserMessage({ schema, context, voiceTranscript });

    logger.info('aiFillForm called', {
      uid: request.auth.uid,
      projectId,
      schemaId: schema.id,
      hasTranscript: !!voiceTranscript,
    });

    const resp = await getClient().messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 2000,
      system: FLHA_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
    });

    const text = extractText(resp);
    const parsed = parseJsonResponse<FillFormResponse>(text);
    if (!parsed) {
      logger.error('AI returned unparseable response', { text: text.slice(0, 500) });
      throw new HttpsError('internal', 'AI response was not valid JSON.');
    }

    return {
      values: parsed.values ?? {},
      confidence: parsed.confidence ?? 'medium',
      notes: parsed.notes ?? 'Filled from project context.',
    };
  }
);

// ─────────────────────────────────────────────────────────────────────────
// aiExtractHazards — fast voice-to-hazards endpoint
// ─────────────────────────────────────────────────────────────────────────

interface ExtractHazardsRequest {
  voiceTranscript: string;
  projectType?: string;
}

interface ExtractHazardsResponse {
  workSummary: string;
  hazards: string[];
  ppe: string[];
  confidence: 'high' | 'medium' | 'low';
}

export const aiExtractHazards = onCall<ExtractHazardsRequest, Promise<ExtractHazardsResponse>>(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 20 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const { voiceTranscript, projectType } = request.data;
    if (!voiceTranscript || voiceTranscript.length < 3) {
      throw new HttpsError('invalid-argument', 'voiceTranscript too short.');
    }
    if (voiceTranscript.length > 2000) {
      throw new HttpsError('invalid-argument', 'voiceTranscript too long.');
    }

    const resp = await getClient().messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 800,
      system: HAZARD_EXTRACTION_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: buildHazardExtractionMessage(voiceTranscript, projectType) },
      ],
    });

    const parsed = parseJsonResponse<ExtractHazardsResponse>(extractText(resp));
    if (!parsed) {
      throw new HttpsError('internal', 'AI response was not valid JSON.');
    }
    return {
      workSummary: parsed.workSummary ?? voiceTranscript,
      hazards: parsed.hazards ?? [],
      ppe: parsed.ppe ?? [],
      confidence: parsed.confidence ?? 'medium',
    };
  }
);

// ─────────────────────────────────────────────────────────────────────────
// aiAnalyzeDeficiency — image + voice → structured deficiency
// ─────────────────────────────────────────────────────────────────────────

interface AnalyzeDeficiencyRequest {
  /** Base64-encoded image data (without the data: prefix). */
  imageBase64: string;
  imageMediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  voiceTranscript?: string;
}

interface AnalyzeDeficiencyResponse {
  title: string;
  description: string;
  trade: string;
  severity: 'minor' | 'major' | 'safety-critical';
  recommendedAction: string;
  confidence: 'high' | 'medium' | 'low';
}

export const aiAnalyzeDeficiency = onCall<AnalyzeDeficiencyRequest, Promise<AnalyzeDeficiencyResponse>>(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const { imageBase64, imageMediaType, voiceTranscript } = request.data;
    if (!imageBase64) {
      throw new HttpsError('invalid-argument', 'imageBase64 required.');
    }

    const resp = await getClient().messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 600,
      system: DEFICIENCY_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: imageMediaType, data: imageBase64 },
            },
            {
              type: 'text',
              text: voiceTranscript
                ? `Worker said: "${voiceTranscript}"\n\nAnalyze the photo and produce the deficiency report.`
                : 'Analyze the photo and produce the deficiency report.',
            },
          ],
        },
      ],
    });

    const parsed = parseJsonResponse<AnalyzeDeficiencyResponse>(extractText(resp));
    if (!parsed) throw new HttpsError('internal', 'AI response was not valid JSON.');
    return parsed;
  }
);

// ─────────────────────────────────────────────────────────────────────────
// aiAskProject — answer a question from project-history snippets
// ─────────────────────────────────────────────────────────────────────────

interface AskProjectRequest {
  question: string;
  projectName: string;
  snippets: Array<{ type: string; date: string; by?: string; text: string }>;
}

export const aiAskProject = onCall<AskProjectRequest, Promise<{ answer: string }>>(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const { question, projectName, snippets } = request.data;
    if (!question || !snippets?.length) {
      throw new HttpsError('invalid-argument', 'question and snippets required.');
    }

    const history = snippets.slice(0, 60).map((s) =>
      `[${s.date}] (${s.type}${s.by ? ` · ${s.by}` : ''}) ${s.text}`,
    ).join('\n');

    const resp = await getClient().messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 600,
      system: ASK_PROJECT_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Project: ${projectName}\n\nHistory snippets:\n${history}\n\nQuestion: ${question}`,
      }],
    });

    return { answer: extractText(resp).trim() };
  }
);

// ─────────────────────────────────────────────────────────────────────────
// aiScanPhoto — the AI Camera: classify anything, extract everything
// ─────────────────────────────────────────────────────────────────────────

interface ScanRequest {
  imageBase64: string;
  imageMediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  voiceTranscript?: string;
}

interface ScanResponse {
  kind: 'progress' | 'materials' | 'safety' | 'other';
  summary: string;
  trade: string;
  location: string;
  materials: Array<{ item: string; quantity: string }>;
  safetyIssues: string[];
  progressPct: number | null;
  confidence: 'high' | 'medium' | 'low';
}

export const aiScanPhoto = onCall<ScanRequest, Promise<ScanResponse>>(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const { imageBase64, imageMediaType, voiceTranscript } = request.data;
    if (!imageBase64) {
      throw new HttpsError('invalid-argument', 'imageBase64 required.');
    }

    const resp = await getClient().messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 700,
      system: SCAN_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: imageMediaType, data: imageBase64 },
            },
            {
              type: 'text',
              text: voiceTranscript
                ? `Worker said: "${voiceTranscript}"\n\nAnalyze the photo.`
                : 'Analyze the photo.',
            },
          ],
        },
      ],
    });

    const parsed = parseJsonResponse<ScanResponse>(extractText(resp));
    if (!parsed) throw new HttpsError('internal', 'AI response was not valid JSON.');
    return parsed;
  }
);

// ─────────────────────────────────────────────────────────────────────────
// aiAnalyzeWork — progress photo + voice → structured work-log entry
// ─────────────────────────────────────────────────────────────────────────

interface AnalyzeWorkRequest {
  imageBase64: string;
  imageMediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  voiceTranscript?: string;
}

interface AnalyzeWorkResponse {
  summary: string;
  trade: string;
  location: string;
  quantities: string;
  flags: string;
  confidence: 'high' | 'medium' | 'low';
}

export const aiAnalyzeWork = onCall<AnalyzeWorkRequest, Promise<AnalyzeWorkResponse>>(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const { imageBase64, imageMediaType, voiceTranscript } = request.data;
    if (!imageBase64) {
      throw new HttpsError('invalid-argument', 'imageBase64 required.');
    }

    const resp = await getClient().messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 500,
      system: WORKLOG_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: imageMediaType, data: imageBase64 },
            },
            {
              type: 'text',
              text: voiceTranscript
                ? `Worker said: "${voiceTranscript}"\n\nProduce the work-log entry.`
                : 'Produce the work-log entry from the photo alone.',
            },
          ],
        },
      ],
    });

    const parsed = parseJsonResponse<AnalyzeWorkResponse>(extractText(resp));
    if (!parsed) throw new HttpsError('internal', 'AI response was not valid JSON.');
    return parsed;
  }
);

// ─────────────────────────────────────────────────────────────────────────
// aiAnalyzeReceipt — receipt photo → line items
// ─────────────────────────────────────────────────────────────────────────

interface AnalyzeReceiptRequest {
  imageBase64: string;
  imageMediaType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export const aiAnalyzeReceipt = onCall<AnalyzeReceiptRequest>(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
    const { imageBase64, imageMediaType } = request.data;
    if (!imageBase64) throw new HttpsError('invalid-argument', 'imageBase64 required.');

    const resp = await getClient().messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 1200,
      system: RECEIPT_OCR_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: imageMediaType, data: imageBase64 } },
            { type: 'text', text: 'Extract the receipt data. Return only JSON.' },
          ],
        },
      ],
    });

    const parsed = parseJsonResponse<unknown>(extractText(resp));
    if (!parsed) throw new HttpsError('internal', 'AI response was not valid JSON.');
    return parsed;
  }
);

// ─────────────────────────────────────────────────────────────────────────
// aiGenerateDailyLog — synthesize end-of-shift daily log
// Uses Sonnet because the writing quality matters.
// ─────────────────────────────────────────────────────────────────────────

interface DailyLogRequest {
  projectId: string;
  dateISO: string; // YYYY-MM-DD
}

export const aiGenerateDailyLog = onCall<DailyLogRequest>(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
    const { projectId, dateISO } = request.data;
    if (!projectId || !dateISO) {
      throw new HttpsError('invalid-argument', 'projectId and dateISO required.');
    }
    await assertProjectAccess(request.auth.uid, projectId);

    const day = await loadDayData(projectId, dateISO);

    const resp = await getClient().messages.create({
      model: SONNET_MODEL,
      max_tokens: 1500,
      system: DAILY_LOG_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Generate the Daily Log for ${dateISO}.\n\nProject day data:\n${JSON.stringify(day, null, 2)}`,
        },
      ],
    });

    const parsed = parseJsonResponse<unknown>(extractText(resp));
    if (!parsed) throw new HttpsError('internal', 'AI response was not valid JSON.');
    return parsed;
  }
);

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

async function assertProjectAccess(uid: string, projectId: string): Promise<void> {
  const db = getFirestore();
  const [userSnap, memberSnap] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`projects/${projectId}/members/${uid}`).get(),
  ]);
  if (userSnap.data()?.role === 'admin') return;
  if (memberSnap.exists) return;
  throw new HttpsError('permission-denied', 'Not a member of this project.');
}

function extractText(resp: Anthropic.Messages.Message): string {
  const parts = resp.content.filter((c) => c.type === 'text') as Array<{ type: 'text'; text: string }>;
  return parts.map((p) => p.text).join('\n');
}

/**
 * Extract JSON from an LLM response.
 *
 * Defensive: handles models that wrap output in ```json fences, prepend text,
 * or append commentary. We find the first '{' and matching closing '}'.
 */
function parseJsonResponse<T>(text: string): T | null {
  if (!text) return null;
  const cleaned = text.replace(/```json|```/g, '').trim();
  // Find outermost JSON object
  const start = cleaned.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1)) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

async function loadDayData(projectId: string, dateISO: string): Promise<unknown> {
  const db = getFirestore();
  const dayStart = new Date(`${dateISO}T00:00:00-08:00`).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;

  const [project, attendance, submissions] = await Promise.all([
    db.doc(`projects/${projectId}`).get(),
    db
      .collection(`projects/${projectId}/attendance`)
      .where('clockInAt', '>=', new Date(dayStart))
      .where('clockInAt', '<', new Date(dayEnd))
      .get(),
    db
      .collection(`projects/${projectId}/submissions`)
      .where('submittedAt', '>=', new Date(dayStart))
      .where('submittedAt', '<', new Date(dayEnd))
      .get(),
  ]);

  return {
    project: project.data(),
    attendance: attendance.docs.map((d) => ({ id: d.id, ...d.data() })),
    submissions: submissions.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}
