/**
 * Records pipeline — every form submission becomes a permanent record:
 *
 *   submission created → PDF rendered (pdfkit) → saved to Storage
 *   (projects/{pid}/submissions/{subId}/record.pdf) → emailed to the office
 *   via Resend with subject "FLHA · Project · Date · Person".
 *
 * Secrets:
 *   RESEND_API_KEY — from resend.com (free tier: 3,000 emails/month)
 *   RECORDS_EMAIL  — where records go, e.g. office@brownbros.example
 *
 * From-address: uses Resend's onboarding sender until a domain is verified
 * in Resend (then switch RECORDS_FROM below to e.g. records@consitehq.com).
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import PDFDocument from 'pdfkit';

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const RECORDS_EMAIL = defineSecret('RECORDS_EMAIL');
const RECORDS_FROM = 'Consite Records <onboarding@resend.dev>';

type AnyMap = Record<string, unknown>;

export const onSubmissionRecord = onDocumentCreated(
  {
    document: 'projects/{projectId}/submissions/{subId}',
    secrets: [RESEND_API_KEY, RECORDS_EMAIL],
    memory: '512MiB',
    timeoutSeconds: 120,
  },
  async (event) => {
    const sub = event.data?.data() as AnyMap | undefined;
    if (!sub) return;
    const { projectId, subId } = event.params;

    const db = getFirestore();
    const bucket = getStorage().bucket();

    // ── Gather context ────────────────────────────────
    const [projSnap, schemaSnap, userSnap] = await Promise.all([
      db.collection('projects').doc(projectId).get(),
      db.collection('forms').doc(String(sub.schemaId ?? '')).get(),
      db.collection('users').doc(String(sub.submittedBy ?? '')).get(),
    ]);
    const projectName = projSnap.data()?.name ?? projectId;
    const schema = schemaSnap.data() as AnyMap | undefined;
    const personName = userSnap.data()?.displayName ?? String(sub.submittedBy ?? 'Unknown');
    const values = (sub.values ?? {}) as AnyMap;
    // submittedAt is a Firestore Timestamp (serverTimestamp()) — use toMillis;
    // fall back for plain numbers or missing values.
    const tsRaw = sub.submittedAt as { toMillis?: () => number } | number | undefined;
    const submittedMs =
      typeof tsRaw === 'object' && tsRaw?.toMillis ? tsRaw.toMillis()
      : typeof tsRaw === 'number' ? tsRaw
      : Date.now();
    const dateStr = new Date(submittedMs).toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' });
    const formTitle = String(schema?.title ?? sub.schemaId ?? 'Form');
    const category = String(schema?.category ?? 'form').toUpperCase();

    // ── Render PDF ────────────────────────────────────
    const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    doc.fontSize(16).font('Helvetica-Bold').text(formTitle);
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica')
      .text(`Project: ${projectName}`)
      .text(`Date: ${dateStr}`)
      .text(`Submitted by: ${personName}`);
    const gps = sub.gps as AnyMap | undefined;
    if (gps?.lat != null) {
      doc.text(`GPS: ${Number(gps.lat).toFixed(5)}, ${Number(gps.lng).toFixed(5)} (±${Math.round(Number(gps.accuracy ?? 0))}m)`);
    }
    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(572, doc.y).strokeColor('#999').stroke();
    doc.moveDown(0.5);

    const isEmpty = (v: unknown) =>
      v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

    const sections = (schema?.sections ?? []) as Array<AnyMap>;
    for (const section of sections) {
      const fields = ((section.fields ?? []) as Array<AnyMap>).filter((f) => !isEmpty(values[String(f.id)]));
      if (fields.length === 0) continue; // don't print bare headers for untouched sections

      if (doc.y > 680) doc.addPage();
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#1a3b5d').text(String(section.title ?? ''));
      doc.moveDown(0.2);
      doc.fillColor('black');

      for (const field of fields) {
        const id = String(field.id);
        const label = String(field.label ?? id);
        const type = String(field.type);
        const v = values[id];

        if (type === 'signature' && typeof v === 'string') {
          // Signature block is ~80pt tall — break the page first if it won't fit,
          // then anchor the image explicitly under its label.
          if (doc.y > 640) doc.addPage();
          doc.fontSize(9).font('Helvetica-Bold').text(label + ':');
          try {
            let bytes: Buffer;
            if (v.startsWith('data:image')) {
              // v0.1 contract: signature stored inline as a base64 data URL
              bytes = Buffer.from(v.split(',')[1] ?? '', 'base64');
            } else {
              [bytes] = (await bucket.file(v).download()) as unknown as [Buffer];
            }
            const imgY = doc.y + 4;
            doc.image(bytes, 60, imgY, { fit: [180, 55] });
            doc.y = imgY + 62;
          } catch {
            doc.fontSize(9).font('Helvetica-Oblique').text('  [signed — image unavailable]');
          }
          doc.moveDown(0.3);
          continue;
        }

        let display: string;
        if (Array.isArray(v)) display = v.map(String).join('; ');
        else if (typeof v === 'boolean') display = v ? 'Yes' : 'No';
        else if (type === 'date' && typeof v === 'number') display = new Date(v).toLocaleString('en-CA');
        else display = String(v);

        doc.fontSize(9).font('Helvetica-Bold').text(label + ': ', { continued: true })
          .font('Helvetica').text(display);
        doc.moveDown(0.15);
      }
      doc.moveDown(0.5);
    }

    doc.fontSize(8).fillColor('#777').text(
      `Consite record · submission ${subId} · generated ${new Date().toISOString()} · ` +
      'This document was completed and signed in the Consite app with GPS and timestamp verification.',
    );
    doc.end();
    const pdf = await done;

    // ── Store the PDF ─────────────────────────────────
    const pdfPath = `projects/${projectId}/submissions/${subId}/record.pdf`;
    await bucket.file(pdfPath).save(pdf, { contentType: 'application/pdf' });
    await event.data?.ref.update({ pdfStoragePath: pdfPath });

    // ── Email it ──────────────────────────────────────
    const subject = `${category} · ${projectName} · ${dateStr} · ${personName}`;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY.value()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RECORDS_FROM,
        to: [RECORDS_EMAIL.value()],
        subject,
        text:
          `${formTitle}\n\nProject: ${projectName}\nDate: ${dateStr}\nSubmitted by: ${personName}\n\n` +
          'The signed PDF record is attached. This is an automated record from Consite.',
        attachments: [{
          filename: `${category}-${projectName.replace(/\W+/g, '-')}-${dateStr}.pdf`,
          content: pdf.toString('base64'),
        }],
      }),
    });

    if (!res.ok) {
      logger.error(`Resend failed (${res.status}): ${await res.text()}`);
    } else {
      logger.info(`Record emailed: ${subject}`);
    }
  },
);
