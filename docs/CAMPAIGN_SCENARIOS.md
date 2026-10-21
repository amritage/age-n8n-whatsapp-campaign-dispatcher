# Worked scenarios for evergreen audiences, cycle capacity and retries

All numbers are illustrative, **not** a claim of exact Meta available capacity or confirmed delivery. “Submitted” and “Delivered” are different.

## A. INTROMAHA: 4,200 → 4,150 → 4,500 (Meta tier example 2,000)
- **Day 1**: EspoCRM INTROMAHA dynamic AudienceSegment has 4,200 eligible numbers. Native Chatwoot campaign must **NOT** be created with the entire 4,200 merely because tier is 2,000. n8n selects at most 2,000 safely budgeted recipients, gives them a unique label and creates `INTROMAHA-C<cycle>-B1`. Remaining 2,200 remain **UNSENT** in EspoCRM, not queued for Chatwoot to roll over.
- **Day 2**: 50 of the **unsent 2,200** removed; current segment is 4,150. n8n removes those 50 from future eligibility. Once global 26h gap and relevant windows permit the next cycle, it selects up to 2,000 of the now 2,150 unsent. Remaining 150 are deferred.
- **Day 3**: If 350 genuinely new leads are added, dynamic segment becomes 4,500; 150 previously unsent + 350 new = 500 next eligible to send, before further exclusions/other campaign claims. Not all 4,500 are resent.
- Already sent contacts later removed cannot be “unsent”; historical outcomes and campaign attribution remain. Opt-outs always block retries.

## B. Multiple campaigns share one cycle, not duplicated Meta tier
At 2,000 defensible places and simultaneously eligible campaigns, n8n may allocate INTROMAHA=1,000, INTROGUJARAT=600, INTROWESTBENGAL=400. The allocation is **example only**: actual division obeys priority, due date, fairness, template/inbox, windows, suppression and capacity. Three separate Chatwoot one-off campaigns can launch during one coordinated cycle. The global 26h clock begins only after the **last verified batch completion**. On the next eligible cycle, refresh all campaigns and recompute claims. If an eligible window does not overlap the active cycle, defer that campaign rather than silently bypass its window.

## C. Rolling 24h with 26h guard
Batch 001 submitted between 09:00 and 09:15 on Monday. Verified latest batch completion 09:20. Earliest following cycle = Tuesday 11:20 (not 09:00); hourly scheduler + windows may delay further. Another Chatwoot/manual sender consuming Meta capacity can still prevent a new cycle at Tuesday 11:20. If any batch remains Unknown or processing, 26h clock **does not start** based on an assumed end time.

## D. 131049 and 180-day review
Initial failure dated D0 on first intended send. Due retries are **D0+8d**, **D0+18d**, **D0+28d**, *not* day 8 then 18 then 28 days after each previous retry. Each due retry is subject to consent, audience inclusion, portfolio cooldown, no successful delivery, actual Meta restriction and per-phone global gap. If D0+8 occurs on Sunday, the retry is held until next allowed cycle, without advancing to D0+18 until the earlier due retry has an established outcome. Stop after terminal success or exhausted attempts.
For 131026, preserve exact code and treat as undeliverable/unknown rather than “unregistered.” For a configured 180-day hold, on D0+180 mark eligible for **review**, not auto-send despite active opt-out, unknown consent or Meta restrictions.

## E. Reliability scenarios
- Chatwoot creates the campaign, but n8n times out before response. Do **not** create the campaign again until searching/matching durable label/title/ID and operator reconciliation.
- Chatwoot analytics 403 (feature missing): block cycle advancement where reports are mandatory and alert.
- Contact moved out of segment after a campaign begins: no guarantee Chatwoot can cancel in-flight processing; block *future* batches and document unavoidable already-submitted messages.
- Main CRM campaign Paused or master OFF before live creation: do not prepare labels or POST to Chatwoot. If OFF after Chatwoot has begun, cannot guarantee instant stop of the in-progress native batch.
