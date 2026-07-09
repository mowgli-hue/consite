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
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

type NotificationType = 'deficiency' | 'missed-clockout' | 'system';

// ── WhatsApp channel (Meta Cloud API) ─────────────────────────────
// Set both secrets to "disabled" until the Meta setup is done — the
// channel then no-ops and workers still get in-app notifications.
//   WHATSAPP_ACCESS_TOKEN    — permanent token from Meta Business
//   WHATSAPP_PHONE_NUMBER_ID — the sender number's ID from WhatsApp Manager
const WHATSAPP_ACCESS_TOKEN = defineSecret('WHATSAPP_ACCESS_TOKEN');
const WHATSAPP_PHONE_NUMBER_ID = defineSecret('WHATSAPP_PHONE_NUMBER_ID');
export const WHATSAPP_SECRETS = [WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID];

function whatsappEnabled(): boolean {
  try {
    const t = WHATSAPP_ACCESS_TOKEN.value();
    const p = WHATSAPP_PHONE_NUMBER_ID.value();
    return !!t && !!p && t !== 'disabled' && p !== 'disabled';
  } catch { return false; }
}

/** E.164 without the + is what Meta wants: "+1 (604) 555-1234" → "16045551234". */
function waNumber(phone: unknown): string | null {
  if (typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? (digits.length === 10 ? `1${digits}` : digits) : null;
}

/**
 * Send a WhatsApp message. Tries the approved template `consite_update`
 * (one body parameter) first — required for business-initiated messages —
 * then falls back to free text (works inside a 24h service window).
 */
async function sendWhatsApp(phone: unknown, text: string): Promise<void> {
  if (!whatsappEnabled()) return;
  const to = waNumber(phone);
  if (!to) return;

  const url = `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID.value()}/messages`;
  const headers = {
    Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN.value()}`,
    'Content-Type': 'application/json',
  };

  const tpl = await fetch(url, {
    method: 'POST', headers,
    body: JSON.stringify({
      messaging_product: 'whatsapp', to, type: 'template',
      template: {
        name: 'consite_update',
        language: { code: 'en' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: text.slice(0, 500) }] }],
      },
    }),
  });
  if (tpl.ok) { logger.info(`WhatsApp template sent to …${to.slice(-4)}`); return; }

  const free = await fetch(url, {
    method: 'POST', headers,
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text.slice(0, 900) } }),
  });
  if (free.ok) logger.info(`WhatsApp text sent to …${to.slice(-4)}`);
  else logger.warn(`WhatsApp failed (${tpl.status}/${free.status}): ${await free.text()}`);
}

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

/**
 * Worker gets notified when assigned to a project.
 * Written to users/{uid}/notifications — shown as a banner in the app.
 * WhatsApp/SMS channel plugs in here once a WhatsApp Business number
 * is approved (send inside this function, same payload).
 */
export const onWorkerAssigned = onDocumentCreated(
  { document: 'projects/{projectId}/members/{uid}', secrets: WHATSAPP_SECRETS },
  async (event) => {
    const db = getFirestore();
    const projSnap = await db.collection('projects').doc(event.params.projectId).get();
    const p = projSnap.data();
    if (!p) return;

    await db.collection('users').doc(event.params.uid).collection('notifications').add({
      type: 'project-assigned',
      title: `New site: ${p.name}`,
      body: `${p.address ?? ''}${p.geofenceEnabled ? ' · GPS clock-in enabled' : ''}`.trim(),
      projectId: event.params.projectId,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    // WhatsApp (if channel enabled and worker has a phone on file)
    const userSnap = await db.collection('users').doc(event.params.uid).get();
    await sendWhatsApp(
      userSnap.data()?.phone,
      `You've been added to a new site: ${p.name}${p.address ? ` — ${p.address}` : ''}. Open Consite to clock in and see details.`,
    );
    logger.info(`Worker ${event.params.uid} notified: assigned to ${p.name}`);
  },
);

/** Worker gets an in-app notification when a pin-task is assigned to them. */
export const onPinAssigned = onDocumentCreated(
  { document: 'projects/{projectId}/plans/{planId}/pins/{pinId}', secrets: WHATSAPP_SECRETS },
  async (event) => {
    const data = event.data?.data();
    if (!data?.assigneeUid) return;

    const db = getFirestore();
    const projSnap = await db.collection('projects').doc(event.params.projectId).get();
    await db.collection('users').doc(String(data.assigneeUid)).collection('notifications').add({
      type: 'pin-task',
      title: `${data.type === 'issue' ? '⚠ Issue' : '📌 New task'} on the drawing`,
      body: `${String(data.instruction ?? '').slice(0, 140)} — ${projSnap.data()?.name ?? 'site'}`,
      projectId: event.params.projectId,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    const userSnap = await db.collection('users').doc(String(data.assigneeUid)).get();
    await sendWhatsApp(
      userSnap.data()?.phone,
      `${data.type === 'issue' ? 'Issue assigned to you' : 'New task for you'} at ${projSnap.data()?.name ?? 'the site'}: ${String(data.instruction ?? '').slice(0, 200)}. Open Consite → My Tasks.`,
    );
    logger.info(`Pin task notification → ${data.assigneeUid}`);
  },
);

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
