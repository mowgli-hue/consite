/**
 * SMS notifications via Twilio (REST API — no SDK dependency).
 *
 * Secrets (set with `firebase functions:secrets:set <NAME>`):
 *   TWILIO_ACCOUNT_SID   — from twilio.com/console
 *   TWILIO_AUTH_TOKEN    — from twilio.com/console
 *   TWILIO_FROM_NUMBER   — your Twilio number, e.g. +16045550123
 *   ALERT_PHONE          — where alerts go (the office), e.g. +16045550999
 *
 * Sends:
 *   1. onDeficiencyCreated — instant SMS when a worker reports a deficiency
 *      (safety-critical ones are prefixed with 🚨).
 *   2. missedClockoutSweep — 9pm Vancouver daily: closes shifts left open
 *      >14h, flags them for review, and texts the office a digest.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

const TWILIO_ACCOUNT_SID = defineSecret('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = defineSecret('TWILIO_AUTH_TOKEN');
const TWILIO_FROM_NUMBER = defineSecret('TWILIO_FROM_NUMBER');
const ALERT_PHONE = defineSecret('ALERT_PHONE');

const SMS_SECRETS = [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, ALERT_PHONE];

async function sendSms(to: string, body: string): Promise<void> {
  const sid = TWILIO_ACCOUNT_SID.value();
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${TWILIO_AUTH_TOKEN.value()}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: TWILIO_FROM_NUMBER.value(), Body: body }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    logger.error(`Twilio send failed (${res.status}): ${text}`);
  } else {
    logger.info(`SMS sent to ${to.slice(0, 5)}…`);
  }
}

export const onDeficiencyCreated = onDocumentCreated(
  { document: 'projects/{projectId}/deficiencies/{defId}', secrets: SMS_SECRETS },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const db = getFirestore();
    const projSnap = await db.collection('projects').doc(event.params.projectId).get();
    const projectName = projSnap.data()?.name ?? 'a site';

    const severity = String(data.severity ?? '').toLowerCase();
    const critical = severity === 'safety' || severity === 'critical' || severity === 'high';
    const title = data.title ?? 'Deficiency reported';

    const body =
      `${critical ? '🚨 ' : ''}Consite: ${title} @ ${projectName}` +
      (data.trade ? ` [${data.trade}]` : '') +
      (severity ? ` — severity: ${severity}` : '');

    await sendSms(ALERT_PHONE.value(), body.slice(0, 320));
  },
);

export const missedClockoutSweep = onSchedule(
  { schedule: '0 21 * * *', timeZone: 'America/Vancouver', secrets: SMS_SECRETS },
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
      await sendSms(
        ALERT_PHONE.value(),
        `Consite: ${flagged.length} missed clock-out${flagged.length === 1 ? '' : 's'} auto-closed & flagged for review:\n` +
          flagged.slice(0, 8).join('\n'),
      );
    }
    logger.info(`Missed clock-out sweep: ${flagged.length} flagged`);
  },
);
