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
`Schedule Trigger (60m)` → `Read-only Design Gate` → `Stop: adapter not configured`. Required adapter flow: list pending/recent batches; paginate Chatwoot analytics/contacts in 25s; join by Chatwoot contactId+batchId to EspoCRM recipient; validate status/error; idempotently upsert outcomes; poll late updates; calculate 131049 due on D0+8/18/28 and restricted-number 180d review. Reconcile report discrepancies and incomplete sessions before releasing a next cycle.

## Why shells instead of fabricated production JSON?
The repo currently describes **future-state CRM API operations**; it does not supply the installed AGE extension's actual audience/policy/atomic-reservation endpoints. Creating live-ready HTTP nodes with invented endpoints would either fail or risk unsafe sends. Gate remains inert until a versioned, exercised integration exists.

## Acceptance/rollout
- Test on mocked adapter fixtures and actual staging API responses, using opted-in test contacts for the later pilot.
- Compare preview counts to selected Chatwoot label membership and reported individual deliveries/failed codes, including 25-record pagination.
- Kill switch on both scheduler and delivery API paths.
- Explicit review and enablement only after T-35+ (see test plan).
