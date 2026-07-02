# The AI Layer — Architecture

> The moat. Everything else is plumbing.

## What it does

A worker opens an FLHA. Instead of an empty form, they see:

- Project, crew, weather, and today's work already filled in.
- A "AI auto-filled — high confidence" banner explaining what's set.
- A big mic button at the top: "What are you doing today?"

The worker holds the mic, says "framing 2nd floor, heights and nail guns," and lets go. Five seconds later, the hazards (Working at heights, Struck-by, Manual handling) and required PPE (Hard hat, Fall arrest, Safety glasses, Cut-resistant gloves) are filled in. They sign once. Submitted in under a minute.

## How it works

```
                ┌─────────────────────────────────────┐
                │ Worker opens FLHA on phone          │
                └─────────────────────┬───────────────┘
                                      │
                  PASS 1 — pre-fill from context only
                                      │
                                      ▼
       ┌──────────────────────────────────────────────────┐
       │ Cloud Function: aiFillForm                       │
       │                                                  │
       │ 1. Authenticate, verify project membership.      │
       │ 2. buildContext(projectId, workerUid)            │
       │      → project doc                               │
       │      → weather (Open-Meteo, free)                │
       │      → crew (whoever is clocked in)              │
       │      → recent work (last 3 submissions)          │
       │ 3. Build prompt with FLHA system prompt          │
       │    + schema + context                            │
       │ 4. Call Claude Haiku 4.5                         │
       │ 5. Parse JSON response → FormValues              │
       └──────────────────────┬───────────────────────────┘
                              │
                  Form renders 80% pre-filled
                              │
                  Worker holds mic, talks
                              │
            PASS 2 — refine with voice transcript
                              │
                              ▼
       ┌──────────────────────────────────────────────────┐
       │ Cloud Function: aiFillForm (again)               │
       │                                                  │
       │ Same as pass 1 but now with voiceTranscript      │
       │ → hazards + PPE + work description filled        │
       └──────────────────────┬───────────────────────────┘
                              │
                              ▼
                    Worker reviews + signs + submits
```

The two-pass approach is deliberate:

- Pass 1 runs the moment the form opens. The worker sees pre-filled fields before they could have typed anything. This is the wow.
- Pass 2 runs after voice input. Refines hazards based on what the worker said.

## The endpoints

All live in `functions/src/ai-fill.ts`. All require Firebase Auth + project membership.

| Endpoint | What it does | Model |
|---|---|---|
| `aiFillForm` | Pre-fill any FormSchema from context + optional voice | Haiku 4.5 |
| `aiExtractHazards` | Voice transcript → hazards[] + PPE[] (faster, no schema) | Haiku 4.5 |
| `aiAnalyzeDeficiency` | Photo + voice → structured deficiency report | Haiku 4.5 |
| `aiAnalyzeReceipt` | Receipt photo → vendor, amount, line items | Haiku 4.5 |
| `aiGenerateDailyLog` | End-of-day site data → written Daily Log | Sonnet 4.6 |

## The prompts

Live in `functions/src/ai-prompts.ts`. **These prompts are the product.** Iterate carefully:

- They teach Claude the WorkSafeBC hazard taxonomy (so output is consistent across all submissions).
- They enforce JSON-only output (no markdown, no prose).
- They tell Claude to leave fields empty rather than fabricate. Trust matters more than completeness.
- They include BC-specific concerns: heat stress, seasonal, wet weather.

When you tune a prompt, do it in a branch, run it against a corpus of real FLHAs, compare confidence + accuracy. Don't yolo-deploy.

## Costs

Default model is Claude Haiku 4.5 — fast, cheap, plenty smart for schema-filling.

- Roughly 1500 input tokens + 500 output tokens per FLHA fill.
- At Haiku pricing (~$1/MTok in, $5/MTok out): ~$0.004 per fill.
- A 50-worker company doing one FLHA each per day = ~$60/month in API fees.

Daily Log gen uses Sonnet because writing quality matters. ~$0.02 per log. Negligible.

## Context engine

`functions/src/context.ts` assembles everything Claude needs. The key insight: most context is already in Firestore. We don't ask the worker — we look it up.

- **Project info** — direct read from `/projects/{id}`.
- **Crew on site** — query `attendance` where `clockOutAt == null`. Fast.
- **Recent work** — last 3 submissions by this worker on this project. Gives Claude "what was happening yesterday."
- **Weather** — Open-Meteo's free forecast API (ECCC data, no API key needed). Includes a simplified Humidex calculation to trigger heat-stress warnings.

Add more context here as we expand to new form types. For incident reports: pull recent near-misses. For toolbox talks: pull the last 5 topics. For daily log: pull every event of the day.

## Trust calibration — important

The AI is wrong sometimes. Workers need to know which fields are AI guesses and which are their own input. Today we mark this with:

- The teal "AI auto-filled — high/medium/low confidence" banner at the top of any form with AI fills.
- A "Clear AI fills" action so a worker can start fresh.
- Required-field validation still applies — if AI left a required field empty, the worker must fill it before submitting.

In v0.2 we'll add per-field highlighting (subtle teal accent on AI-filled fields) so the worker sees exactly which values to verify.

## Failure modes

The system degrades gracefully:

- **AI call fails** — form opens empty. Worker fills it manually. Same as before.
- **Voice recognition unavailable** — manual text-input fallback appears. Same outcome, slower.
- **Network down** — pre-fill skipped. The scaffold's offline form rendering still works. (Submission queues are v0.2.)
- **Unparseable AI response** — caught, logged, form opens empty. Worker doesn't see an error; just no pre-fill.

This is intentional. The AI layer should feel like a gift when it works, not a blocker when it doesn't.

## Provider lock-in

We use Anthropic's SDK directly. If we want to swap providers (OpenAI, Gemini) we change one file (`ai-fill.ts`). Prompts stay the same in concept; format strings adjust.

Not planning to swap. Anthropic's tool use, vision, and reliability are best-in-class for this use case as of build time.
