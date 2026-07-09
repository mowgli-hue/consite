import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type { FormSchema, FormValues } from '../types';

export interface AiFillResult {
  values: FormValues;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
}

export async function fillFormWithAi(opts: { schema: FormSchema; projectId: string; voiceTranscript?: string }): Promise<AiFillResult> {
  const fn = httpsCallable<typeof opts, AiFillResult>(functions, 'aiFillForm');
  const res = await fn(opts);
  return res.data;
}

export interface HazardExtractionResult {
  workSummary: string;
  hazards: string[];
  ppe: string[];
  confidence: 'high' | 'medium' | 'low';
}

export async function extractHazardsFromVoice(opts: { voiceTranscript: string; projectType?: string }): Promise<HazardExtractionResult> {
  const fn = httpsCallable<typeof opts, HazardExtractionResult>(functions, 'aiExtractHazards');
  const res = await fn(opts);
  return res.data;
}

export interface DeficiencyResult {
  title: string;
  description: string;
  trade: string;
  severity: 'minor' | 'major' | 'safety-critical';
  recommendedAction: string;
  confidence: 'high' | 'medium' | 'low';
}

export async function analyzeDeficiency(opts: { imageBase64: string; imageMediaType: 'image/jpeg' | 'image/png' | 'image/webp'; voiceTranscript?: string }): Promise<DeficiencyResult> {
  const fn = httpsCallable<typeof opts, DeficiencyResult>(functions, 'aiAnalyzeDeficiency');
  const res = await fn(opts);
  return res.data;
}

export interface ReceiptLineItem {
  description: string;
  qtyOrUnit: string;
  amountCents: number;
}

export interface ReceiptResult {
  vendor?: string;
  date?: string;
  category: string;
  subtotalCents: number;
  gstCents: number;
  pstCents: number;
  totalCents: number;
  lineItems: ReceiptLineItem[];
  confidence: 'high' | 'medium' | 'low';
}

export async function analyzeReceipt(opts: { imageBase64: string; imageMediaType: 'image/jpeg' | 'image/png' | 'image/webp'; projectId?: string }): Promise<ReceiptResult> {
  const fn = httpsCallable<typeof opts, ReceiptResult>(functions, 'aiAnalyzeReceipt');
  const res = await fn(opts);
  return res.data;
}

export interface WorkLogResult {
  summary: string;
  trade: string;
  location: string;
  quantities: string;
  flags: string;
  confidence: 'high' | 'medium' | 'low';
}

export async function analyzeWork(opts: { imageBase64: string; imageMediaType: 'image/jpeg' | 'image/png' | 'image/webp'; voiceTranscript?: string }): Promise<WorkLogResult> {
  const fn = httpsCallable<typeof opts, WorkLogResult>(functions, 'aiAnalyzeWork');
  const res = await fn(opts);
  return res.data;
}

export interface DailyLogResult {
  log: string;
  summary: string;
  flagged: string[];
}

export async function generateDailyLog(opts: { projectId: string; dateISO: string }): Promise<DailyLogResult> {
  const fn = httpsCallable<typeof opts, DailyLogResult>(functions, 'aiGenerateDailyLog');
  const res = await fn(opts);
  return res.data;
}
