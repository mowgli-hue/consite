# Consite v3 Vision — The AI Operating System for Field Construction

**The one question every feature must answer:**
> How do I save a foreman one hour every day?

Not the owner. The foreman. If the foreman loves it, everyone else uses it.

**The core bet:** construction software is built around documents; Consite is built
around the **job site**. Every project is a living digital twin that updates all day —
photos, voices, clock-ins, forms — and becomes a permanent, searchable memory.

---

## The five layers

| Layer | What | Status |
|---|---|---|
| 1. Daily Operations | Attendance, FLHA, daily logs, punch list, deficiencies, receipts, documents, hours approval, records pipeline | ✅ largely built (v0.2–v0.4) |
| 2. AI Copilot | Foreman opens the app → a briefing, not buttons: weather, crew on site, inspections, expiring certs, open issues, materials due | next major surface |
| 3. Site Intelligence | Every photo becomes data: trade, location, progress, quantities — auto-filed | 🌱 seeded (Work Update: photo+voice → structured entry + timeline) |
| 4. Predictive AI | Schedule-slip prediction from real activity signals | after 3 has data volume |
| 5. Company Brain | "Where did we install that beam?" → answer + photo + who + drawing rev | after 3–4; needs embeddings/search |

## Signature features (in vision order)

- **AI Camera** — open camera, shoot, done. AI extracts room/trade/stage/progress/materials/issues. *Work Update is v0 of this; the end state removes even the confirm step.*
- **Material counting** — point at lumber → "148 studs". (needs vision fine-tuning experiments)
- **Safety scanner** — video walk → hazards flagged. "Grammarly for safety."
- **Smart drawings** — pins on blueprints (v0.4 roadmap: pin-tasks), later AR overlay.
- **Voice everything** — nobody types. Every worker statement updates the system.
- **AI meeting notes** — record toolbox talk → tasks, owners, deadlines, emailed.
- **Worker reputation** — attendance + quality + safety + certs → crew intelligence.
- **Client mode** — client sees timeline/photos/progress instead of calling.
- **AI schedule builder** — describe the job → draft schedule.
- **Site Replay** — slider through the whole build, week by week. The demo that sells.

## Phased roadmap

**Phase 1 — Essential (→ 100 customers)**
Voice-first daily logs ✅ · AI photo organization 🌱 (Work Update) · smart deficiency
reporting ✅ · attendance & GPS ✅ · forms & compliance ✅ · searchable project history 🌱
(timeline is the substrate; search comes next)

**Phase 2 — Intelligent (→ 1,000 customers)**
Progress detection from photos · material prediction · AI project summaries (the
Copilot briefing) · client portal · meeting transcription · safety detection

**Phase 3 — Revolutionary (category-defining)**
Site Replay · "ask your project anything" · digital twin per site · predictive
scheduling · CV quality checks · company-wide knowledge engine

## Architecture implication (already honored)

Every feature writes **structured, timestamped, GPS-tagged, per-project data** —
workLog, attendance, submissions, deficiencies. That data model IS the moat:
Layers 2–5 are queries and models over what Layer 1/3 capture daily. Nothing built
so far needs rework to serve the vision.
