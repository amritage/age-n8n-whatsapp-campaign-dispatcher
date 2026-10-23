# Pre-import release checklist — AGE n8n-managed Data Tables pack
**Date:** 23 October 2026 (Asia/Kolkata). **Target:** n8n 2.37.9 queue mode, Chatwoot 4.19.0, EspoCRM with existing AGE Campaign Management. **Branch:** main.

## Two independent review perspectives

### A. n8n engineer / reliability (build and execution)
- JSON imports with official `n8nio/n8n:2.37.9 import:workflow --separate --input=/workflows`, including top-level workflow IDs. *Import does not verify execution against user credentials or live APIs.*
- Only native `@traien/n8n-nodes-espocrm@1.4.0`, `@renatoascencio/n8n-nodes-chatwoot@0.9.0` and built-in n8n **Data Table 1.1** are used for the recommended workflows. Both community packages were already shown installed in the user's n8n UI; **the actual worker runtime has not been tested**.
- Data Table row queries are now strictly **bounded** (max **51** portfolio records and **3,001** events). The Data Table event query orders newest first and the Code node **blocks on overflow** rather than silently treating a truncated ledger as complete.
- Separate triggers (manual and schedule) are supported. All workflows import **inactive**. `Continue On Fail` on the combined EspoCRM / Chatwoot nodes produces an actionable DRY_RUN/HOLD report if an API cannot be reached. The actual GUI result will be tested by the operator.
- The setup workflow reuses matching named managed tables; **reuse does not validate or migrate their columns**. Check all columns and types if tables already exist. Import all workflows into the **same n8n project** so the By Name resolver finds the correct tables.
- Data Tables use n8n-managed storage. No new application DB SQL schema/migrations, no external HTTP nodes and no new packages required for the recommended path. Existing SQL reference is explicitly optional.
- The n8n-managed table store has a **default 200 MiB** maximum in upstream n8n 2.37.9, subject to instance configuration. Do not store individual message contents, names, phone numbers, credentials or unbounded per-recipient histories there.

### B. campaign operator / policy and security (business rules)
- **Every** current workflow other than the manual managed-table-creation setup is READ-ONLY. No campaign create, label mutation, Meta send, EspoCRM attempt, CRM event write, PostgreSQL reservation or approval edits.
- Both portfolio preflight and global DRY_RUN check: master switch, operator approval, Chatwoot analytics/account-health evidence, recent Meta tier/quality evidence, complete external usage evidence, unresolved cycles, **prior-cycle history explicitly verified**, last verified batch completion **26h gap**, and reservation-ledger evidence. They emit `canSend:false` even when all self-reported inputs are positive.
- n8n Data Tables **cannot provide multi-worker atomic unique-reservation guarantees**. A production sender must not treat an upsert or manual row approval as exactly-once delivery authorization.
- `131050` opt-out is classified as hard marketing suppression; `131049` follows the unchanged existing AGE 8/18/28-days-after-previous-failure policy; `131026` remains UNKNOWN, not automatically Not Registered. Event summaries are **recorded observations only**, because no current workflow ingests live provider events.
- Meta's portfolio-wide **moving** 24h unique-recipient tier/usage, per-day delivered goal, monetary spend, operational attempt limit and the global 26h gap remain **different** accounting concepts.
- No supposed last Chatwoot campaign completion or Chatwoot analytics count is equated with verified Meta delivery/event evidence. A non-empty Data Table row does not prove recipient consent, template approval or a matching CRM attempt.
- Existing AGE Campaign Management extensions, earlier production workflows and Chatwoot source remain unchanged. **No live WhatsApp sends authorized.**

## Exact files to import, in order

| Step | GitHub workflow | Why | Expected output |
|---|---|---|---|
| 1 | `workflows/age-dt-setup-managed-tables.json` | **Manual-only** create/reuse `AGE_Portfolio_Control` and `AGE_Dispatcher_Events` n8n managed tables (writes only to managed n8n metadata). Run once, then inspect column types | `mode=SETUP_ONLY`, `portfolioSeeded=false`, `canSend=false` |
| 2 | `workflows/age-00-chatwoot-analytics-capability.json` | Bind installed Chatwoot credential, discover one existing native WhatsApp campaign automatically, then **read** its campaign metrics (only if exists) | PASS, BLOCKED (401/403/404), or UNVERIFIED; zero sends |
| 3 | `workflows/age-01-espo-campaign-preflight.json` | Bind installed EspoCRM credential, automatically inspect Campaign metadata | `activeCount`, configuration blockers, `canSend=false` |
| 4 | `workflows/age-02-portfolio-preflight-datatable.json` | Read n8n portfolio table; **do not insert fake WABA tier/limits** just to get a green status | Empty table → `NO_PORTFOLIO_CONTROL_ROWS`, BLOCKED; records with missing fields → detailed holds |
| 5 | `workflows/age-06-global-cycle-dry-run-datatable.json` | Single combined native EspoCRM + Chatwoot + Data Table check | `mode=DRY_RUN`, `decision=HOLD`, `canSend=false`, `createdCampaigns=0` |
| 6 | `workflows/age-04-meta-error-watch-datatable.json` | Review **recorded** errors, no live event ingestion in this pack | `NO_RECENT_RECORDED_EVENTS` is expected on a new table |
| 7 | `workflows/age-05-operations-dashboard-datatable.json` | Inspect aggregate managed Data Table activity | `RECORDED_ACTIVITY_ONLY`, not complete provider settlement |

Do **not** import or activate the similarly named `age-02-postgres-...`, `age-04-meta-error-watch.json`, `age-05-operations-dashboard.json`, or `age-06-global-cycle-dry-run.json` for this recommended path; those use the older, optional custom PostgreSQL design. The old `age-multi-campaign-cycle-controller.json` and `age-chatwoot-campaign-reconciliation.json` are **inert architecture shells**, not ready-to-send engines.

**There is no need to enter Campaign IDs manually** into Code nodes. Select the existing installed community-node credentials in the editor. The official Data Table nodes find tables **by exact name** inside the same project.

## If an error appears
- **"Table not found"**: confirm WF-SETUP completed and the workflows are in the same n8n project; check spelling and project permissions.
- **"Column does not exist"**: the setup workflow reused an older, differently shaped table. Compare `AGE_Portfolio_Control` columns with `docs/DATA_TABLE_STORAGE_DECISION.md`, including the new `priorCycleHistoryVerified` boolean, and add missing columns using n8n Data Tables UI. Do not wipe existing data.
- **"Community node unknown"**: confirm your queue worker (not just UI) has the exact installed EspoCRM and Chatwoot community-node packages.
- **Analytics 401/403/404**: likely entitlement/role restriction; BLOCKED is expected and should not be fixed by choosing an invented campaign ID or bypassing license rules.
- **51 portfolio rows / 3,001 event rows**: report is intentionally bounded; clean/report data into compact rollups, do not switch to unlimited scans.
- **An unexpected n8n exception or STOP**: do not activate schedule. Capture redacted node name, error and code-node output (never tokens, phone numbers or message contents).

## Test claims / limitations

The GitHub Actions CI verifies **JavaScript/Code-node mock scenarios**, workflow graph safety and **actual disposable n8n 2.37.9 JSON import**. It also runs earlier PostgreSQL tests on an isolated temporary DB as a **legacy reference**, not a deployment requirement.

**Unverified here:** actual managed table creation and row reads on the user's own n8n instance, community-node authentication/API behavior against EspoCRM/Chatwoot, Chatwoot campaign analytics entitlement, production Meta limit evidence, any client consent snapshot or customer delivery. CI PASS does NOT mean these are ready to send.

**Go-live is deliberately not in this pack.** Full multi-campaign sending requires independently verified source-based recipient eligibility/opt-out, immutable batches, a durable atomic idempotent claim protocol, provider receipt/attempt mapping, reliable Meta portfolio usage and separate explicit approval.
