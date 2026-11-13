/**
 * Feedback → email. The company types a change request or a problem in
 * Settings → "Send us feedback"; it lands in the Jungle Labs inbox (the
 * standing RECORDS_EMAIL address) within seconds, with who sent it.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const RECORDS_EMAIL = defineSecret('RECORDS_EMAIL');
const FEEDBACK_FROM = 'Consite Feedback <onboarding@resend.dev>';

export const onFeedbackCreated = onDocumentCreated(
  { document: 'feedback/{fid}', secrets: [RESEND_API_KEY, RECORDS_EMAIL] },
  async (event) => {
    const fb = event.data?.data();
    if (!fb || !event.data) return;

    let company = '';
    try {
      company = String((await getFirestore().collection('settings').doc('app').get()).data()?.companyName ?? '');
    } catch { /* optional */ }

    const who = `${fb.name ?? 'Someone'}${fb.email ? ` <${fb.email}>` : ''}`;
    const text = String(fb.text ?? '').slice(0, 8000);
    const subject = `Consite feedback${company ? ` · ${company}` : ''} · ${fb.name ?? 'user'}`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY.value()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FEEDBACK_FROM,
        to: [RECORDS_EMAIL.value()],
        ...(fb.email ? { reply_to: String(fb.email) } : {}),
        subject,
        text: `From: ${who}\nScreen: ${fb.page ?? '—'}\n\n${text}\n\n— sent from Consite → Settings → Send us feedback`,
      }),
    });

    if (!res.ok) {
      logger.error(`Feedback email failed (${res.status}): ${await res.text()}`);
      await event.data.ref.update({ emailed: false });
    } else {
      logger.info(`Feedback emailed: ${subject}`);
      await event.data.ref.update({ emailed: true });
    }
  },
);
