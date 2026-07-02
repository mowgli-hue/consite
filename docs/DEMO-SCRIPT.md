# Demo Script — for the customer meeting

> Hand them your phone. Don't narrate from the slides. Let the app talk.

## Setup before the meeting

- [ ] Real Firebase project deployed, real Anthropic key set as secret
- [ ] One project in Firestore at the customer's actual project address (geofence accurate)
- [ ] A test worker account, you signed in as them on your phone
- [ ] Phone fully charged, screen brightness up
- [ ] You're standing within the geofence (so clock-in works)
- [ ] Practice the flow twice before they arrive

## The 90-second script

**Open:** "I want to show you what we're building. Don't read anything — just watch."

**Tap clock-in.** Wait the 3 seconds for GPS check. App says "Clocked in to [project]."

**Say:** "Now imagine it's 7 AM. Your crew is on site. They each tap that, takes 5 seconds. So far this is normal."

**Tap FLHA.** Wait 2 seconds for the AI pre-fill. The fields populate.

**Say:** "Watch what happened. The form already knows this project, the weather, who's with me on site, and that I was framing yesterday. None of that I typed."

**Tap the mic. Say into it:** "Framing second floor today, working at heights with nail guns."

**Release.** Wait 3 seconds for hazards to populate.

**Say:** "It pulled out the hazards and matched the PPE. I didn't tap a single checkbox."

**Scroll through quickly.** Show them the filled hazards, PPE, work description.

**Say:** "I sign once at the bottom. That's it."

**Sign. Submit.**

**Pause. Let them react.** Do not fill the silence.

## What they'll probably ask

**"How long until it's ready?"**
Answer: "v0.1 is built — what you just saw is real, not a mockup. To run it at your company we need 2-3 weeks to harden, train on your work types, and ship to your guys' phones."

**"How much?"**
Answer: "Let's not put a number on it today. Tell me how many workers and how many sites — I'll send you a number Friday." (Then go back to your laptop and price it after you know if they're 8 workers or 80.)

**"What if the AI gets it wrong?"**
Answer: "It's wrong sometimes. Worker reviews everything before signing — they can clear all AI fills and start fresh, or change individual fields. The worker is always the source of truth. The AI is just a starting point so they don't have to type from scratch."

**"What about offline?"**
Answer: "Pre-fill needs internet. If the worker has no signal, the form opens empty and they fill it manually — same as today, no worse. v0.2 queues submissions offline." (Be honest. They'll respect it.)

**"What about Punjabi?"**
Answer: "Coming in v0.2. The whole UI translates, and the AI understands Punjabi voice input natively — Claude is trained on Punjabi." (Confirm with me before promising other languages.)

**"Does it integrate with QuickBooks?"**
Answer: "Yes — but in v0.3. Cost-coded hours export to QuickBooks Online or Sage. We're not trying to replace your bookkeeper's tool, just feed it the right data."

**"Can it do payroll?"**
Answer: "No — and that's deliberate. We push approved hours to Wagepoint or whatever you use. BC payroll has too many edge cases (WCB premiums, vacation pay, stat holidays) to do well. We do the field side; payroll specialists do payroll."

## What NOT to say

- Do not mention "AI" 8 times. Workers don't care about AI. They care about not typing. Frame it as "the app is fast" or "the app knows."
- Do not promise Punjabi out of the box if you haven't built it yet.
- Do not show them code, the Firebase console, or the admin dashboard. They're a foreman, not a CTO.
- Do not quote a price in the room. Do the math after.
- Do not promise features beyond v0.1 unless they ask. Stay focused.

## If they say yes on the spot

**Lock the scope:**
1. Their company name + how many users.
2. Their first project + geofence coordinates.
3. Their current FLHA template (if they have one — we'll match it).
4. Their cost code list (for the time tracking later).
5. Whether they want it branded as Consite or white-labelled.

**Send the same day:**
- A 1-page proposal with: scope (v0.1), price, timeline (3 weeks), payment terms (50% deposit, 50% on go-live), what's NOT included.
- An invite to a 30-minute kickoff call within 7 days.

**Don't start building the customizations until the deposit lands.** Lesson from Franco.

## If they say no or stall

That's information, not failure. Ask:
1. What's the biggest pain in their day-to-day that we missed?
2. What would they need to see to say yes?
3. Is there someone else in their company we should also show this to (foreman, safety officer, owner)?

Send them the written pitch (the email I drafted earlier) as a follow-up. Some people decide better in writing than in person.
