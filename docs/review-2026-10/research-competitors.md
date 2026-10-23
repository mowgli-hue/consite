# Consite — Competitor Benchmark & BC Contractor Needs
Research date: 2026-10-22 (America/Vancouver). Public web only. Prices were checked via web search snapshots of vendor and third-party pages on that date. Labels: **[Vendor]** = vendor page, **[3P]** = third party, **[Assumption]** = my inference.

## 1. Competitor benchmark

| App | Core features | UX they do best | Public pricing (checked 2026-10-22) | Target size |
|---|---|---|---|---|
| **Procore** | PM, RFIs, submittals, drawings, daily logs, quality & safety, financials, bidding | Single system of record for GC, owner and subs; unlimited users | **No public price.** Quote based on Annual Construction Volume (ACV) and products. Capterra lists "from $10K/yr" [3P]; ConTechGuide estimates $30–60K year 1 [3P, estimate] | Mid-to-large commercial GCs |
| **Buildertrend** | Scheduling (Gantt), daily logs, client portal and selections, estimates, change orders, POs, budgets, time clock, warranty, QuickBooks/Xero | Homeowner/client portal, selections, residential workflow | **Custom quote**, unlimited users, 10% off if paid annually [Vendor]. Former tiers were $499/$799/$1,099 per month (USD, historical) [3P]. Reported typical spend is $8–10K/yr [3P] | Residential builders and remodelers, ~$500K–$10M revenue [3P] |
| **Fieldwire (Hilti)** | Plan viewing, sheet compare, tasks and punch lists, forms, specs, BIM, RFIs, submittals, change orders (Business Plus) | Offline plan viewing and markup pinned to tasks; punch lists | **USD** [Vendor]: Basic $0 (5 users, 3 projects, 100 sheets). Pro $39/user/mo annual or $54 monthly. Business $64 annual or $79 monthly. Business Plus $1,068/yr or $104/mo | Subs and GCs of all sizes; free tier for small teams |
| **CompanyCam** | Unlimited photos and video, GPS and timestamps, checklists, reports, AI walkthrough notes, LiDAR (Scale), payments (US only) | Fastest photo capture with auto GPS/time, project timeline, shareable galleries | **USD** [Vendor help centre]: Core $63/mo annual or $79 monthly (1–2 users). Crew $119 or $149 (3 users). Scale $249 or $299 (3 users; a 3P snapshot shows $199/$249). Extra users $34/mo. Enterprise for 50+ users. Price conflicts: sources disagree, so recheck | Small trades and residential/roofing crews |
| **Raken** | Daily reports, photos, time cards, production tracking, toolbox talks, safety and quality checklists | Superintendent daily report with weather and crew hours; toolbox talks | **Quote-based on the web.** iOS in-app purchases: Basic $31.99, Professional $64.99, Performance $79.99 (USD) [App Store]. Reported annual rates are ~$23–$59/user/mo with a 3-user minimum [3P] | Small-to-mid field crews and subs |
| **SafetyCulture (iAuditor)** | Inspections and checklists, issues, actions, training, assets, sensors, analytics | Best-in-class mobile form builder, offline inspections, photo annotation, PDF reports | [3P snapshots of vendor page, currency not explicitly stated, likely USD (assumption)]: Free (up to 10 users, 5 templates). Premium $24/seat/mo annual or $29 monthly, tax extra. Enterprise by quote | Multi-industry, from small teams to enterprise. Not construction-specific |

### Strengths / weaknesses from public reviews
Review pages (open them for current ratings; I did not record star counts):
- Procore: https://www.capterra.com/p/56250/Procore/ · https://www.g2.com/products/procore/reviews
  - Strengths: central project record, field–office collaboration, unlimited users.
  - Weaknesses: high cost, slowness and bugs, rigid notifications, steep learning curve.
- Buildertrend: https://www.capterra.com/p/70092/Buildertrend/ · https://www.g2.com/compare/buildertrend-vs-procore
  - Strengths: client portal, scheduling, all-in-one.
  - Weaknesses: slow, complex navigation, too many notifications, weak QuickBooks/accounting sync.
- Fieldwire: https://www.g2.com/products/fieldwire/reviews · https://www.capterra.com/p/142420/Fieldwire/
  - Common themes [Assumption, not verified line by line]: easy plan and task UX; reporting and forms are limited on lower tiers.
- CompanyCam: https://www.g2.com/products/companycam/reviews · https://apps.apple.com/us/app/companycam/id960073750
  - Common themes [Assumption]: very simple capture; not a full PM or safety tool; per-user cost grows quickly.
- Raken: https://www.capterra.com/p/140906/Raken/ · https://apps.apple.com/ag/app/raken-construction-management/id747582049
  - Strengths [3P]: fast daily reports.
  - Weaknesses [3P]: safety and time tracking only on the top tier; renewal increases reported (dailysitelog.com).
- SafetyCulture: https://www.g2.com/products/safetyculture/reviews · https://www.capterra.com/p/135040/iAuditor/
  - Strengths: flexible templates, free tier.
  - Weaknesses [3P siteworkjournal]: not built for construction, so you build JHA/FLHA templates yourself.

> Note: Capterra product IDs for Fieldwire, Raken and iAuditor were not verified. Search the product name if a link fails.

### Gap for Consite [Assumption]
No single affordable tool combines WorkSafeBC-specific forms (FLHA, crew talks, first aid records, Form 7 prep, 3.23 orientation) with time tracking, photos and Canadian data storage for 5–50 person BC crews. Raken and SafetyCulture come closest on safety; CompanyCam on photos; Fieldwire on plans.

## 2. BC small/mid contractor needs

### WorkSafeBC / OHS Regulation (B.C. Reg. 296/97)
- **OHS program and meetings (3.1–3.3):**
  - Firms with 20+ workers (or certain hazard levels) need a formal program. Smaller firms need an informal program with monthly health and safety meetings, with attendance, date and topics recorded.
  - Sources: https://www.worksafebc.com/en/law-policy/occupational-health-safety/searchable-ohs-regulation/ohs-regulation/part-03-rights-and-responsibilities · guidelines: https://www.worksafebc.com/en/law-policy/occupational-health-safety/searchable-ohs-regulation/ohs-guidelines/guidelines-part-03
  - The 20-worker threshold is from my knowledge of s.3.1. **Verify it.**
- **Toolbox/crew talks:** in practice this is how the monthly meeting requirement above gets met. Construction firms often hold them more often (industry practice, assumption).
- **FLHA:** the Regulation does not use the term "FLHA". It is industry practice for meeting hazard identification and risk assessment duties, e.g. s.3.5 inspections ("regular inspections… to prevent unsafe conditions") and the Part 20 construction rules. **[Assumption: confirm exact clauses.]** Product need: a quick daily pre-task form with hazards, controls and crew sign-off.
- **First aid records (3.19):** record every injury or exposure that is reported or treated. Keep **at least 3 years**, confidential, and available to an officer. WorkSafeBC says electronic records "should be stored in Canada".
  - Sources: https://www.worksafebc.com/en/health-safety/first-aid/record-first-aid-incidents · Schedule 3-A sets the kit and attendant levels (amended effective 2024-11-01): https://www.bclaws.gov.bc.ca/civix/document/id/lc/regulationbulletin/r0132_2023
- **Incident reporting, Form 7:** the employer reports injury or occupational disease to WorkSafeBC within **3 days** of learning of it (gov.bc.ca says "three business days").
  - Sources: https://www.worksafebc.com/-/media/WorksafeBC/Resources/forms/all-forms/7-pdf-en.pdf · https://www2.gov.bc.ca/gov/content/careers-myhr/managers-supervisors/occupational-health-safety/worksafebc-reporting
  - Incident investigation duties are in WCA Part 2, Div 10. Not fetched; verify.
- **Young/new worker orientation (3.22–3.25):**
  - "Young" means under 25. "New" includes new to the site, returning to changed hazards, or relocated.
  - 3.23(2) lists required topics (a)–(m): supervisor contact, rights including refusing unsafe work, rules, hazards, working alone, violence, PPE, first aid location, emergency procedures, task demonstration, OHS program, WHMIS, committee/rep contact.
  - 3.25: keep records.
  - Sources: https://www.bclaws.gov.bc.ca/civix/document/id/crbc/crbc/296_97_multi/ (Part 3 last amended 2026-10-01)
  - Product need: a checklist template with exactly those 13 items, plus signatures.
- **Retention (BC Employers' Advisers record retention guide):**
  - First aid records: 3 yrs.
  - Orientation records: length of employment + 1 yr.
  - OHS program: indefinitely.
  - Inspection reports and orders: indefinitely.
  - Joint committee reports: 2 yrs.
  - JHSC training: service + 2 yrs.
  - Source: https://www2.gov.bc.ca/assets/gov/employment-business-and-economic-development/employers/employers-advisers-office/record_retention_guide_2025.pdf

### Privacy & data residency
- **BC PIPA** (private sector, SBC 2003 c.63) does **not** prohibit storing data outside Canada. It requires reasonable security, notice/consent for employee personal information, and destroying data once it's no longer needed.
  - Sources: https://www.oipc.bc.ca/blog/news/in-the-clouds-and-beyond-navigating-access-and-storage-outside-of-canada/ · https://www.canlii.org/en/bc/laws/stat/sbc-2003-c-63/latest/sbc-2003-c-63.html
- FOIPPA residency rules apply to public bodies. They matter only if you sell to them [assumption].
- WorkSafeBC recommends Canadian storage for first aid records (link above). That supports a **Canadian region (e.g. ca-central / Montréal or Toronto) as a selling point.**

### Payroll & time tracking
- **ESA s.28:** keep payroll records (hours worked each day, wages, overtime, deductions, etc.) in English at the BC principal place of business for **4 years**.
  - Source: https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/forms-resources/igm/esa-part-3-section-28
- Daily and weekly overtime rules (over 8 h/day and over 40 h/week) come from ESA ss.35, 40. This is from my knowledge and **not fetched; verify.**
- Product needs [Assumption]:
  - per-day hours by job and cost code
  - break tracking
  - GPS clock-in with consent notice (PIPA)
  - export to Canadian payroll (e.g. QuickBooks Online Canada, Wagepoint, ADP Canada)
  - stat holiday handling
  - WorkSafeBC assessable-payroll reporting by classification unit

## 3. Consite source code on this box
Searched with `rg -il consite /workspace --max-depth 4` and `find /workspace -maxdepth 3 -iname '*consite*'`.
- **No source code found.** Hits:
  - `/workspace/jungle-labs/consite/` (only `qa-screens/00_not_signed_in_login_redirect.webp`)
  - `/workspace/consite-review/` (QA screenshots, rounds 1–4)
  - `/workspace/g.sh` (a screenshot helper)
- From the screenshot file names only (inference, not code), the app has:
  - lifecycle, photos, documents, forms with PDF output, punch list, daily logs
  - crew and crew board, dashboard, search, inbox, timeline
  - money, reports, clients, users, compliance, safety centre, library
- QA file names also point to issues: "crew step spinner stuck", "users dup", "crew board dup", "projects click goes dashboard", "hours redirects reports".
- Stack and data model: **cannot be determined** without the code.
