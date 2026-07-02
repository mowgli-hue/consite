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
