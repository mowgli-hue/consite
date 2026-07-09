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
export { onDeficiencyCreated, missedClockoutSweep, onWorkerAssigned } from './notifications';

// Records pipeline (submission → PDF → email)
export { onSubmissionRecord } from './records';

// AI form-fill engine
export {
  aiFillForm,
  aiExtractHazards,
  aiAnalyzeDeficiency,
  aiAnalyzeReceipt,
  aiGenerateDailyLog,
} from './ai-fill';
