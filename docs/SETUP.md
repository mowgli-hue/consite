# Setup — First Run

## 1. Install

```bash
cd apps/consite
npm install
cd functions && npm install && cd ..
```

## 2. Create the Firebase project

1. Go to https://console.firebase.google.com → **Add project**.
2. Upgrade to **Blaze (pay-as-you-go)** — required for Cloud Functions.
3. Enable **Authentication** → Email/Password sign-in.
4. Enable **Firestore** (production mode is fine — our rules cover it).
5. Enable **Storage**.
6. Project Settings → General → Your apps → Web → copy the config.

## 3. Configure the app

```bash
cp .env.example .env
# Fill in EXPO_PUBLIC_FIREBASE_* values from step 2.
```

## 4. Get an Anthropic API key

1. https://console.anthropic.com → API Keys → Create Key.
2. Set it as a Firebase Functions secret (NOT in code, NOT in .env):

   ```bash
   firebase functions:secrets:set ANTHROPIC_API_KEY
   # Paste the key when prompted. It's encrypted at rest in GCP.
   ```

3. Verify it's set:

   ```bash
   firebase functions:secrets:access ANTHROPIC_API_KEY
   ```

## 5. Push rules, indexes, functions

```bash
firebase login
firebase use --add        # link to your Firebase project
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
```

The functions deploy will pin `ANTHROPIC_API_KEY` to each AI function automatically (declared via `defineSecret` in code).

## 6. Bootstrap the first admin

The `createWorker` function requires an admin caller, so the first admin must be created manually.

1. Firebase Console → Authentication → Add user → create yourself.
2. Copy the uid.
3. Firestore → create `/users/{your-uid}`:

   ```json
   {
     "displayName": "Your Name",
     "email": "you@junglelabsworld.com",
     "role": "admin",
     "active": true,
     "createdAt": 0,
     "projectIds": []
   }
   ```

Once you have one admin, the in-app admin UI (v0.3) handles the rest.

## 7. Seed a sample project + form

In Firebase Console → Firestore, create:

- `/projects/sample-project-1` — see `SAMPLE_PROJECT` in `src/data/seed.ts`. Set the geofence center to a location you can physically stand within (or near, since the radius default is 150m).
- `/projects/sample-project-1/members/{your-uid}` — see `buildSampleWorkerMember(uid, 'SEED')`.
- `/forms/flha-daily-v1` — see `SAMPLE_FLHA_FORM` in `src/data/seed.ts`.
- `/dashboards/worker/modules/{moduleId}` for each item in `SEED_DASHBOARD_MODULES`.

To test as a worker, create a second user in Auth + `/users/{uid}` doc with `role: 'worker'` and add them to the project's members subcollection.

## 8. Run the app

```bash
npx expo start
```

Press `i` for iOS simulator, `a` for Android, or scan the QR with Expo Go on a real device.

### Important for v0.1 demo

- **GPS:** Test geofencing on a **physical device**. The iOS simulator's GPS is unreliable. On a real device, walk within/outside the geofence radius to verify clock-in succeeds/fails as expected.
- **Voice:** The voice input falls back to manual typing in **Expo Go**. For real on-device speech recognition (the demo wow factor), you need a development build with `expo-speech-recognition` installed. For the customer demo, manual typing works fine — Claude doesn't care if the worker spoke or typed.
- **AI:** Confirm `ANTHROPIC_API_KEY` is set before testing. Open a form — if it pre-fills, you're live. If it opens empty with no error, check `firebase functions:log`.

## 9. Verify the AI flow end-to-end

1. Sign in as the test worker.
2. Tap **Clock In** on the sample project (stand within the geofence).
3. Tap **FLHA Forms** → the seeded daily FLHA.
4. The form should open with project name, crew, weather, and recent work pre-filled. The "AI auto-filled — high confidence" banner should appear at top.
5. Hold the mic, say "Framing today, heights and nail guns."
6. Within 3-5 seconds the hazards and PPE fields should populate.
7. Sign and submit.
8. The PDF share sheet appears — that's the audit-ready output.

If anything doesn't work, check `firebase functions:log --only aiFillForm` for the API response.

## Troubleshooting

- **"Account not provisioned"** → user exists in Auth but no `/users/{uid}` doc.
- **"You are 320m from the site"** → working as intended. Walk closer, or temporarily set `geofenceEnabled: false` on the project for testing.
- **AI pre-fill silently does nothing** → check `firebase functions:log`. Usually one of: missing secret, invalid API key, Anthropic rate limit, or unparseable JSON response (rare but happens — the parser is defensive).
- **Voice button just opens manual entry** → expected behaviour in Expo Go. Install `expo-speech-recognition` and use a dev build for real speech recognition.
- **iOS build fails on signature canvas** → run `cd ios && pod install` after `expo prebuild`. Or test in Expo Go where it just works.

## Cost expectations

- **Firebase:** Blaze plan, but real-world usage for a 50-worker company stays in the free tier (~$0/month) until you hit ~1M function invocations.
- **Anthropic API:** ~$60-100/month for a 50-worker company doing 1 FLHA/day each. See `docs/AI-LAYER.md` for the breakdown.

You can set spend caps in both Google Cloud and Anthropic Console to avoid surprises.
