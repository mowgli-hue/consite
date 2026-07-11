/**
 * Cloud Functions entry — exports all callables.
 *
 * Grouped:
 *   admin       — createWorker
 *   triggers    — onAttendanceCreated, onSubmissionCreated
 *   ai          — aiFillForm, aiExtractHazards, aiAnalyzeDeficiency,
 *                 aiAnalyzeReceipt, aiGenerateDailyLog
 */

import { initializeApp } from 'firebase-admin/app';
initializeApp();

// Admin / user provisioning
export { createWorker } from './admin';

// Firestore triggers
export { onAttendanceCreated, onSubmissionCreated } from './triggers';

// Notifications (admin inbox + worker alerts)
export { onDeficiencyCreated, missedClockoutSweep, onWorkerAssigned, onPinAssigned, onPhaseCompleted } from './notifications';

// Records pipeline (submission → PDF → email; End-of-Day update re-sends)
export { onSubmissionRecord, onSubmissionEndOfDay } from './records';

// Audit pack (date range → merged PDF of all records)
export { generateAuditPack } from './audit';

// AI form-fill engine
export {
  aiFillForm,
  aiExtractHazards,
  aiAnalyzeDeficiency,
  aiAnalyzeReceipt,
  aiAnalyzeWork,
  aiScanPhoto,
  aiAskProject,
  aiGenerateDailyLog,
} from './ai-fill';
