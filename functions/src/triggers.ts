/**
 * Firestore triggers.
 *
 * `onAttendanceCreated`  — denormalize attendance for fast cross-project reports.
 * `onSubmissionCreated`  — placeholder for server-side PDF re-render in v0.2.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

export const onAttendanceCreated = onDocumentCreated(
  'projects/{projectId}/attendance/{attId}',
  async (event) => {
    const { projectId, attId } = event.params;
    const data = event.data?.data();
    if (!data) return;
    logger.info(`Attendance created: project=${projectId} att=${attId} uid=${data.uid}`);
    // v0.2: write to a flat /reports/attendance collection for cross-project queries
  }
);

export const onSubmissionCreated = onDocumentCreated(
  'projects/{projectId}/submissions/{subId}',
  async (event) => {
    const { projectId, subId } = event.params;
    const data = event.data?.data();
    if (!data) return;
    logger.info(`Submission created: project=${projectId} sub=${subId}`);
    await event.data?.ref.update({ _ackedAt: FieldValue.serverTimestamp() });
  }
);
