# n8n workflow design and status

This repository includes **importable, disabled-by-default orchestration shells** and a local pure-JS planner with unit tests. **They do NOT implement production sends**: installed EspoCRM adapters, Meta tier/usage evidence, Chatwoot label/API reconciliation, transactional reservation, error recovery and enterprise analytics must be connected and tested before LIVE.

## Workflow 1: `workflows/age-multi-campaign-cycle-controller.json`
`Schedule Trigger (60m)` → `Read-only Design Gate` → `Stop: adapter not configured`. The importable node graph deliberately cannot send; it documents the hourly run cadence and intended integration seam. Replace the gate only after the adapter contract is verified. Required future nodes:
1. schedule and transactional cycle lock (n8n Postgres, portfolio key)
2. EspoCRM Get Master + Active campaigns, validate date/weekday/window/time zone
3. Portfolio Meta tier/usage estimate + outstanding unconfirmed reservation check
4. EspoCRM audience+due retries paginated and policy verdict (fresh)
5. `src/cycle-planner.js` parity logic embedded in Code node or deployed as an independently tested callable service (n8n Code node cannot `require` repo modules by default)
6. Postgres atomic reserve of cycle and unique canonical phones, scoped to portfolio; idempotency key
7. Chatwoot contact upsert → preserve existing labels → assign unique batch label → verify exact batch membership
8. Recheck master, date/window, latest membership, suppression and template. POST Chatwoot one-off campaign once; save Chatwoot displayId mapping; timeout => UNKNOWN (no blind duplicate)
9. Poll campaign completion and only finalize global clock when all batches verified completed.

## Workflow 2: `workflows/age-chatwoot-campaign-reconciliation.json`
`Schedule Trigger (60m)` → `Read-only Design Gate` → `Stop: adapter not configured`. Required adapter flow: list pending/recent batches; paginate Chatwoot analytics/contacts in 25s; join by Chatwoot contactId+batchId to EspoCRM recipient; validate status/error; idempotently upsert outcomes; poll late updates; calculate 131049 on 8/18/28 days after each preceding failure (current unchanged AGE extension), and restricted-number 180d review. Reconcile report discrepancies and incomplete sessions before releasing a next cycle.

## Why shells instead of fabricated production JSON?
The repo currently describes **future-state CRM API operations**; it does not supply the installed AGE extension's actual audience/policy/atomic-reservation endpoints. Creating live-ready HTTP nodes with invented endpoints would either fail or risk unsafe sends. Gate remains inert until a versioned, exercised integration exists.

## Acceptance/rollout
- Test on mocked adapter fixtures and actual staging API responses, using opted-in test contacts for the later pilot.
- Compare preview counts to selected Chatwoot label membership and reported individual deliveries/failed codes, including 25-record pagination.
- Kill switch on both scheduler and delivery API paths.
- Explicit review and enablement only after T-35+ (see test plan).


## Workflow 3: `workflows/age-api-readiness-readonly.json` (manual GET probe)

This is an actual read-only integration diagnostic, **not** the campaign sender. It has a manual trigger, a strict configuration gate and four HTTP **GET-only** nodes, using separate n8n Header Auth credentials to check (a) EspoCRM Campaign, (b) AGE Campaign summary, (c) Chatwoot Campaign and (d) Chatwoot analytics metrics. It returns only booleans and aggregate counts, not contacts or messages. There are **no outgoing POST/PATCH/PUT/DELETE nodes, credentials, or real endpoint hosts in GitHub**.

To run after import: fill in the five `REPLACE_*` values in its `Readiness Config - Fail Closed` Code node. Configure two n8n **Header Auth** credentials separately: header `X-Api-Key` for the two EspoCRM GET nodes, and `api_access_token` for the two Chatwoot GET nodes. Keep the workflow inactive and execute manually. Confirm its configuration and behavior against your n8n version. HTTP 401/403/404 or missing analytics entitlement is **FAIL**, not permission to proceed. Never put token values into the workflow JSON or GitHub.

The diagnostic does not send a message, create labels, create campaigns, update the CRM, or resolve known B-002/B-003/B-004 integration blockers. Real installed environment verification has not yet been performed.

Retry calculation during the interim uses [the unchanged extension policy](RETRY_POLICY_TEMPORARY.md): 8, then 18, then 28 days after each preceding 131049 failure, subject to fresh CRM eligibility.


## Workflow 4: `workflows/age-chatwoot-recipient-report-readonly.json` (manual recipient analytics)

A 7-node **manual, disabled**, **GET-only** n8n workflow based on Chatwoot v4.19.0 source. Reads metrics, first contacts page, enumerates all pages (max 500), downloads each page, validates unique contact IDs and complete statuses, and returns aggregate counts plus error-code frequency. Does **not** emit contact names/phones/message text in final output, import CRM events or write to any database. Execution saving disabled. Configure a dedicated Chatwoot Header Auth n8n credential and non-secret host/account/campaign display ID; use the new workflow, leaving all older workflows untouched. Import and actual account API testing are still pending.

For durable individual reporting, `sql/reporting-staging.sql` is a **separate, proposed private n8n Postgres schema** tested using a synthetic PostgreSQL 16 GitHub Actions job. It is not migrated into production yet, and there is no Postgres write node in this manual workflow. Future approved storage must use parameterized SQL and an authoritative campaign-recipient ID mapping.
