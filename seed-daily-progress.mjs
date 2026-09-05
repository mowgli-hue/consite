// Seeds the Daily Progress form (requested by Brown Bros):
// per worker per project — name auto-known from sign-in, date, photos,
// description, submit. Rides the existing pipeline: submission → PDF →
// Storage + email, visible in project history and Search.
// Run with:  node seed-daily-progress.mjs
// (uses ADC — `gcloud auth application-default login` if it complains)

import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'consite-prod' });
const db = admin.firestore();

const DAILY_PROGRESS_SCHEMA = {
  id: 'daily-progress-v1',
  title: 'Daily Progress',
  description:
    'One per worker per day, inside the project. Your name and the date come from your sign-in — just add photos and what you got done.',
  category: 'report',
  version: 1,
  archived: false,
  createdBy: 'SEED:brownbros',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  sections: [
    {
      id: 'progress',
      title: 'Today’s Progress',
      fields: [
        { id: 'work-date', type: 'date', label: 'Date', required: true },
        { id: 'photos', type: 'image', label: 'Photos / files of the work', max: 6 },
        {
          id: 'description', type: 'multiline', rows: 4, required: true,
          label: 'What did you work on today?',
          placeholder: 'e.g. Framed unit 204 interior walls with Gurpreet — north side done, starting south tomorrow',
        },
        {
          id: 'blockers', type: 'multiline', rows: 2,
          label: 'Anything slowing you down? (optional)',
          placeholder: 'Missing material, waiting on another trade, weather…',
        },
      ],
    },
  ],
};

async function main() {
  console.log(`Seeding forms/${DAILY_PROGRESS_SCHEMA.id} …`);
  await db.doc(`forms/${DAILY_PROGRESS_SCHEMA.id}`).set(DAILY_PROGRESS_SCHEMA);
  console.log('Done — Daily Progress is live in the Forms browser for every project.');
  console.log('(Submitter name + GPS + project are attached automatically to every submission.)');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
