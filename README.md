# Consite

> The construction app where you don't fill forms — you talk, tap, and confirm.

A construction management platform that uses AI to **kill paperwork**. Workers open a form and find it 80% filled — because the app already knows where they are, who they're with, what the weather is, and what they did yesterday. They hold the mic, say one sentence, and the AI fills the rest.

Built by Jungle Labs. Lives at `apps/consite` in the monorepo.

---

## The wedge

Procore, ACC, and Trimble are powerful but heavy, and they still make workers type. SafetyCulture digitizes paper but doesn't think for you. Consite does both — schema-driven forms that pre-fill themselves from context, with voice input for the rest.

**Compliance** is the wedge. **Site operations** is the daily glue. **Time + money** is the lock-in. One AI engine powers all three.

## What's built (v0.1)

The scaffold (Expo + TypeScript + Firebase) is production-shaped. The AI layer is wired in and ready to demo:

- Role-based routing (admin / worker, supervisor as per-project elevation)
- GPS clock-in with geofencing (Apple-friendly, one-shot foreground location)
- JSON-schema form system with 7 field types (text, multiline, dropdown, checkbox, signature, image, date)
- **AI form-fill pipeline** — 5 Cloud Function endpoints calling Claude Haiku 4.5 + Sonnet 4.6
- **Voice input** with manual-typing fallback
- **Context engine** — weather (Open-Meteo, free), crew, recent work history
- On-device PDF export
- Locked-down Firestore + Storage rules (project-scoped, permission-string based)
- One Daily FLHA schema seeded and ready to demo

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | Expo (React Native) + TypeScript | One codebase across iOS/Android/web |
| Routing | Expo Router | File-based, role-gated layouts |
| Backend | Firebase (Auth + Firestore + Storage + Functions) | Free-tier friendly while we onboard early customers |
| AI | Anthropic Claude (Haiku 4.5 + Sonnet 4.6) | Best-in-class for vision + structured output |
| State | React Context + Firestore listeners | Firestore is the source of truth |
| PDF | expo-print (on-device) | Works offline. Sites have bad signal. |
| Geofencing | Haversine + GPS accuracy buffer | Simple, accurate, no PostGIS |
| Voice | expo-speech-recognition + manual fallback | Free, on-device, Apple-friendly |

## Setup

See [`docs/SETUP.md`](./docs/SETUP.md) for the full Firebase + Anthropic setup walkthrough.

```bash
cd apps/consite
npm install
cd functions && npm install && cd ..

cp .env.example .env       # fill in Firebase keys

firebase functions:secrets:set ANTHROPIC_API_KEY
firebase deploy --only firestore:rules,firestore:indexes,storage,functions

npx expo start
```

Then bootstrap the first admin user in Firebase Console (see [SETUP.md](./docs/SETUP.md) step 6).

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                Expo App (iOS / Android / Web)           │
│                                                         │
│   ┌──────────┐  ┌───────────┐  ┌─────────────────┐      │
│   │  (auth)  │  │ (worker)  │  │     (admin)     │      │
│   │  login   │  │ dashboard │  │   dashboard     │      │
│   │          │  │ clock     │  │   users         │      │
│   │          │  │ projects  │  │   form-builder  │      │
│   │          │  │ forms ────┼──→ AI pre-fill     │      │
│   │          │  │ voice ────┼──→ AI extraction   │      │
│   └──────────┘  └───────────┘  └─────────────────┘      │
└─────────────────────────────────────────────────────────┘
                            │
                            │ (Firebase Functions callable)
                            ▼
       ┌───────────────────────────────────────────────┐
       │  Cloud Functions — AI form-fill spine         │
       │                                               │
       │  aiFillForm           (FormSchema + context)  │
       │  aiExtractHazards     (voice → hazards/PPE)   │
       │  aiAnalyzeDeficiency  (photo + voice → defect)│
       │  aiAnalyzeReceipt     (photo → line items)    │
       │  aiGenerateDailyLog   (day data → written log)│
       └────────────────┬──────────────┬───────────────┘
                        │              │
                        ▼              ▼
            ┌────────────────┐  ┌──────────────────┐
            │  Anthropic API │  │   Firestore      │
            │  (Haiku +      │  │  (data + audit)  │
            │   Sonnet)      │  └──────────────────┘
            └────────────────┘
```

For the AI architecture in detail, see [`docs/AI-LAYER.md`](./docs/AI-LAYER.md).

For the customer demo walkthrough, see [`docs/DEMO-SCRIPT.md`](./docs/DEMO-SCRIPT.md).

## Firestore data model

```
/users/{uid}
  { displayName, email, role, projectIds[], active, createdAt }

/projects/{projectId}
  { name, address, geofence: { center, radiusM }, geofenceEnabled,
    active, memberUids[], supervisorUids[], projectType, createdAt }

/projects/{projectId}/members/{uid}
  { role: 'worker'|'supervisor', permissions[], assignedAt, assignedBy }

/projects/{projectId}/plans/{planId}       # PDF drawings
/projects/{projectId}/media/{mediaId}      # photos/videos
/projects/{projectId}/submissions/{subId}  # filled forms + aiAssisted flag
/projects/{projectId}/attendance/{attId}   # clock in/out + GPS

/forms/{formId}                            # form schemas (admin-created)
/templates/{templateId}                    # reusable docs
/dashboards/{role}/modules/{moduleId}      # dynamic dashboard config
```

## Roadmap

### v0.1 — "Demo that wins customers" (built)
- Scaffold + AI pre-fill + voice + FLHA flow

### v0.2 — "Replace their paperwork stack" (~6 weeks)
- AI Daily Log generator
- Cert/ticket pipeline with expiry alerts
- WorkSafeBC incident flow
- Pre-shift equipment checks
- Receipt OCR (endpoint already built)
- Punjabi UI
- Heat stress alerts
- Offline submission queue

### v0.3 — "Admin owns the company from this app" (~8 weeks)
- No-code form builder
- User/project CRUD UI
- Sub management (COI/WSBC tracking)
- Punch lists with plan markup
- Look-ahead schedule
- One-click audit pack generator
- Lien holdback tracker (BC)
- QuickBooks export

### v0.4 — "Procore-killer" (~12 weeks)
- RFI workflow
- Plan revisions + markups
- Client portal
- Foreman AI weekly report
- Anomaly flags
- Wagepoint payroll integration
- French UI (Quebec)

## Conventions

- All Firestore reads go through `src/lib/firebase.ts` helpers.
- Screens are dumb; logic lives in `src/lib/` and `src/contexts/`.
- New AI endpoints go in `functions/src/ai-fill.ts`; their prompts in `functions/src/ai-prompts.ts`.
- New field types = new file in `src/components/fields/` + entry in `FormRenderer.tsx` switch.
- Never store credentials in `.env` (use Firebase secrets).

## Cost expectations (Anthropic API)

- One FLHA fill: ~$0.004 (Haiku, 2 passes including voice)
- One Daily Log generation: ~$0.02 (Sonnet)
- A 50-worker company doing 1 FLHA/day each: ~$60/month

See [`docs/AI-LAYER.md`](./docs/AI-LAYER.md) for the full breakdown.
