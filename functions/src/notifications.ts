/**
 * In-app notifications — written to the flat /notifications collection,
 * displayed in the admin Inbox on the office dashboard.
 *
 * No external provider (Twilio/WhatsApp) — the office sees alerts where
 * they already work. WhatsApp Business API can be layered on later by
 * adding a send inside `pushNotification`.
 *
 *   1. onDeficiencyCreated — instant alert when a worker reports a
 *      deficiency (safety-critical ones marked urgent).
 *   2. missedClockoutSweep — 9pm Vancouver daily: closes shifts left open
 *      >14h, flags them for review, posts a digest to the inbox.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

type NotificationType = 'deficiency' | 'missed-clockout' | 'system';

async function pushNotification(n: {
  type: NotificationType;
  title: string;
  body: string;
  urgent?: boolean;
  projectId?: string;
  projectName?: string;
}) {
  const db = getFirestore();
  await db.collection('notifications').add({
    ...n,
    urgent: n.urgent ?? false,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export const onDeficiencyCreated = onDocumentCreated(
  'projects/{projectId}/deficiencies/{defId}',
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const db = getFirestore();
    const projSnap = await db.collection('projects').doc(event.params.projectId).get();
    const projectName = projSnap.data()?.name ?? 'a site';

    const severity = String(data.severity ?? '').toLowerCase();
    const urgent = severity.includes('safety') || severity.includes('critical') || severity === 'high';

    await pushNotification({
      type: 'deficiency',
      title: `${urgent ? '🚨 ' : ''}${data.title ?? 'Deficiency reported'}`,
      body:
        `${projectName}` +
        (data.trade ? ` · ${data.trade}` : '') +
        (severity ? ` · severity: ${severity}` : '') +
        (data.description ? `\n${String(data.description).slice(0, 200)}` : ''),
      urgent,
      projectId: event.params.projectId,
      projectName,
    });
    logger.info(`Inbox: deficiency alert for ${projectName}`);
  },
);

export const missedClockoutSweep = onSchedule(
  { schedule: '0 21 * * *', timeZone: 'America/Vancouver' },
  async () => {
    const db = getFirestore();
    const cutoffMs = Date.now() - 14 * 3_600_000; // shifts open >14h
    const projects = await db.collection('projects').where('active', '==', true).get();

    const flagged: string[] = [];
    for (const proj of projects.docs) {
      const open = await proj.ref.collection('attendance').where('clockOutAt', '==', null).get();
      for (const att of open.docs) {
        const inAt = att.data().clockInAt;
        const inMs = inAt?.toMillis ? inAt.toMillis() : 0;
        if (inMs > cutoffMs) continue; // still plausibly on shift

        await att.ref.update({
          clockOutAt: FieldValue.serverTimestamp(),
          clockOutBy: 'system:missed-clockout-sweep',
          needsReview: true,
        });

        const uid = att.data().uid as string;
        const userSnap = await db.collection('users').doc(uid).get();
        flagged.push(`${userSnap.data()?.displayName ?? uid.slice(0, 8)} @ ${proj.data().name}`);
      }
    }

    if (flagged.length > 0) {
      await pushNotification({
        type: 'missed-clockout',
        title: `${flagged.length} missed clock-out${flagged.length === 1 ? '' : 's'} auto-closed`,
        body: 'Flagged for review in Hours & Reports:\n' + flagged.slice(0, 10).join('\n'),
        urgent: false,
      });
    }
    logger.info(`Missed clock-out sweep: ${flagged.length} flagged`);
  },
);
