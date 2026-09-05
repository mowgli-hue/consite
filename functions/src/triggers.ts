/**
 * Firestore triggers.
 *
 * `onAttendanceCreated`  — denormalize attendance for fast cross-project reports.
 * `onSubmissionCreated`  — placeholder for server-side PDF re-render in v0.2.
 */

import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { logger } from 'firebase-functions';

/**
 * Deactivation must KILL the session, not just flag the doc — a fired
 * foreman with the app open kept a valid refresh token indefinitely.
 * Revoking forces re-auth within ~1h (ID token expiry); the client also
 * signs out instantly via its profile listener.
 */
export const onUserDeactivated = onDocumentUpdated('users/{uid}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  if (before.active !== false && after.active === false) {
    try {
      await getAuth().revokeRefreshTokens(event.params.uid);
      logger.info(`Revoked refresh tokens for deactivated user ${event.params.uid}`);
    } catch (err) {
      logger.error('Token revocation failed', err);
    }
  }
});

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
