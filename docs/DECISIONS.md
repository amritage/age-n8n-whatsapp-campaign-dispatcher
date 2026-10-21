# Decision register — confirmed vs proposed

**Rule:** Confirmed = explicitly established by AGE in prior discussions. Proposed = recommended future-state default, **not approved**. Open = requires AGE sign-off before implementation. Product capability and provider constraints still need live verification.

## Previously confirmed AGE preferences

| ID | Decision | State |
|---|---|---|
| D-01 | Campaign Active AND master sending enabled = LIVE; otherwise DRY RUN, never an actual provider send | Confirmed |
| D-02 | Daily target should count **delivered successes**, not all attempts; failed unregistered/undeliverable results shouldn't permanently consume target | Confirmed; safeguards below are proposed |
| D-03 | Existing setup: Asia/Kolkata, 08:50–20:10, Sunday off, delivery target 200, 45s pace, min-gap 7 days, queue scan 5, budget max age 45 min | Historical operating settings; not universal system limits |
| D-04 | Preserve original error code and date. 131026 is **not** definitive unregistered | Confirmed |
| D-05 | Preference to re-evaluate retry possibilities after **six months**, rather than permanent failure exclusion | Confirmed, always subordinate to opt-out and Meta restrictions |
| D-06 | Canonical phone field name is `whatsAppStatus`, not `whatsAppRegistrationStatus` | Confirmed |
| D-07 | Global Communication master suppression is authoritative; inactive associations excluded | Confirmed |
| D-08 | Support Contact + Account + Lead and multi-select audience segments | Confirmed |
| D-09 | Remove zero-attempt enrolled recipients through a UI control; eliminate legacy target-list confusion | Confirmed |
| D-10 | Official Meta via Chatwoot for this dispatcher; avoid unapproved WAHA verification methods | Confirmed platform direction |

## Proposed rules — approval needed before live deployment

| ID | Proposed rule | Why | Decision |
|---|---|---|---|
| P-01 | Sender-wide atomic delivery budget plus separate hard daily attempt and spend ceilings | Prevent delivered-only loops from incurring unlimited failures/cost | OPEN |
| P-02 | One outstanding marketing message per canonical phone and global 7-day marketing cooldown | Avoid overlapping campaign fatigue | OPEN |
| P-03 | Event-sourced outbox and status reconciliation after ambiguous Chatwoot timeout | Prevent duplicate sends and stranded reservations | OPEN |
| P-04 | Favor campaign owner-configured priority followed by due date when audiences overlap | Deterministic fairness | OPEN |
| P-05 | Unknown marketing consent blocks until evidence exists | Safer provider/legal compliance baseline | OPEN / should be validated by legal and marketing owner |
| P-06 | All sending countries supported by explicit campaign allowlist, rather than hard-coded India only | AGE's worldwide buyer base | OPEN |
| P-07 | Seven days is minimum gap between **marketing attempts**, with separate category/quality holds | Clarifies whether failed attempts count | OPEN |
| P-08 | A reply does not automatically opt a phone into marketing; agents manage incoming service replies separately | Prevent implicit-consent mistakes | OPEN |

## Focused owner questions

**Q1 — Scope.** Is this dispatcher limited to marketing campaigns, or should the same engine also deliver utility/service templates with distinct permission logic? **Default: marketing only**, keep utility as separate module.

**Q2 — Cap.** Keep 200 Meta-confirmed delivered per sending number per business day as a *target*? What should be the hard maximum **submitted attempts** and/or spend per sender/day? **Default: 200 delivered target, hard attempt ceiling to be approved.**

**Q3 — Audience.** Can campaigns send to all international eligible WhatsApp numbers or India only? **Default: configured allowlist by campaign, initially India.**

**Q4 — Frequency.** Does the 7-day gap apply to every marketing **attempt** (including failed), or only confirmed delivery? Scope across all campaigns and senders? **Default: phone-wide across marketing attempts.**

**Q5 — Retry.** For 131049, 130472 and 131026, does “six months” mean **re-check eligibility only** (human/automated review, no immediate send) or **automatically resend if eligible**? **Default: re-check, then only send after all policy gates and provider restrictions allow.**

**Q6 — Consent.** Where is provable WhatsApp marketing opt-in recorded, and can it be independently verified for historical imported contacts? **Default: missing evidence blocks.**

**Q7 — Collisions.** When multiple campaigns target the same phone simultaneously, should priority be configured, newest campaign first, or FIFO? **Default: explicit priority then earliest due.**

**Q8 — Global ownership.** Which system implements atomic sender-budget claims: a purpose-built EspoCRM endpoint backed by MariaDB transactions or dedicated Postgres (already used alongside n8n)? **Default: dedicated authoritative transactional service; avoid dual budget masters.**

Answers should update this file and the relevant BR clauses **before** modifying live workflow behavior.

## Confirmed 21 Oct 2026: Chatwoot-native orchestration supersedes prior per-message pacing

| ID | Decision | State |
|---|---|---|
| D-11 | Native Chatwoot v4.19 one-off campaign sends. **No Chatwoot code edits.** One EspoCRM logical campaign may generate many Chatwoot one-off batch campaigns | Confirmed design |
| D-12 | One n8n multi-campaign coordinator, not one workflow per EspoCRM campaign; automatically sync unique labels, create Chatwoot campaigns, retrieve individual results | Confirmed target; API integration unverified |
| D-13 | **Option B**: shared **26-hour gap between Meta-portfolio sending cycles**, multiple campaigns per cycle; clock starts after the last verified Chatwoot batch completion | Confirmed |
| D-14 | Chatwoot native batch sending replaces historical **45-second individual pacing** for this architecture | Confirmed |
| D-15 | Scheduler frequency **60 minutes**, reporting reconciler independently **30–60 minutes** (initial shell hourly) | Confirmed architecture |
| D-16 | **131049** scheduled retries on **day 8, day 18, day 28 from first failure**, conditional on fresh eligibility; 180-day holds on applicable other codes are review dates, never unconditional send | Confirmed |
| D-17 | Keep all campaign dates, weekdays, timezone, windows, templates, audience selection, active/master state and recipient restrictions in EspoCRM | Confirmed |

### Still OPEN: deployment details, not discussion reversals
- Exact installed EspoCRM API contract, atomic reservation implementation and portfolio-wide external-send usage evidence.
- Exact Chatwoot v4.19 campaign template payload and self-hosted `campaign_analytics` entitlement.
- Hard per-cycle attempt/spend ceiling, fairness priority, status reconciliation completeness, recovery from unknown Chatwoot POST.
- Existing D-03 historical 45-second pacing, D-02 delivered-only daily target and P-01/P-02 must be interpreted for **Chatwoot batch** architecture: provider batch completion is asynchronous and cannot guarantee exact delivered-stop or per-message pace.
