# Read-only Chatwoot recipient reporting and private long-term evidence

## Implemented in the NEW dispatcher repository
1. `src/read-only-reconciliation.js` makes **real, read-only Chatwoot v4.19** GETs: `.../campaigns/:display_id/analytics/metrics` and paginated `.../analytics/contacts?page=N`. It checks every page, duplicates, zero-recipient campaigns, aggregate consistency and the max page guard. It never emits names, phones or message bodies.
2. `workflows/age-chatwoot-recipient-report-readonly.json` is an importable **manual-only, inactive** 7-node n8n diagnostic: configured host/ID gate; GET metrics; GET first page; enumerate all pages; GET each page; validate totals/error code counts. **Only safe aggregate totals are output.** The HTTP nodes hold individual responses in process memory; successful/error execution saving is disabled. Use a dedicated low-privilege Chatwoot n8n Header Auth credential with header `api_access_token`. Validate against actual installed analytics entitlement.
3. `sql/reporting-staging.sql` defines a **proposed private PostgreSQL** schema for normalized per-recipient statuses and audit of PASS/FAIL/BLOCKED/SKIP runs. No persistent customer IDs or API values are committed to GitHub; do not execute SQL on Chatwoot or EspoCRM databases.

## Limitations — not complete CRM sync
- Chatwoot Enterprise analytics requires the `campaign_analytics` feature (source code for v4.19.0). A 403 blocks this method.
- `analytics/contacts` returns Chatwoot contact ID, status, error code/text but **not** provider message IDs or original send/delivery timestamps. API timestamps from our read time **cannot** be passed to `/AGECampaign/event`.
- The AGE CRM `/AGECampaign/attempt` endpoint assumes an immediate individual submission. Native Chatwoot batches are asynchronous. Therefore **none of these read-only helpers POST events to existing CRM** or claim a recipient was submitted merely from campaign creation.
- Mapping `chatwootCampaignDisplayId + chatwootContactId` to `espoRecipientId` must be captured before send in a private durable ledger; missing mappings fail closed, not guessed by phone/name.
- Read-only Chatwoot `campaign_recipients` database access *may* provide `source_id` and `sent_at/delivered_at/read_at/failed_at` for event accounting (see `sql/chatwoot-campaign-recipient-evidence-readonly.sql`), but source ID semantics, timestamps, access, recipient correlation and old CRM attempt association must be verified on the installed deployment.

## How to test safely in n8n
1. Import `workflows/age-chatwoot-recipient-report-readonly.json` into a **new** workflow. Do not change the old dispatcher.
2. Enter only the Chatwoot host and IDs in `Configure Read-only Chatwoot`. They are placeholders, not embedded credentials. Use a previously existing, **non-production-test campaign if appropriate**; GETs never initiate sending.
3. Bind Chatwoot Header Auth to **both** GET nodes, using header name `api_access_token`.
4. Keep workflow inactive, execute manually, and verify that result counts match Chatwoot Campaign Analytics UI. If permission denied, do not lower account security or attempt unauthorized database reads.
5. Observe PASS/FAIL; record **redacted aggregates** in `reports/TEST_LOG.md` and full, necessary per-recipient records in a private ledger after policy approval. No sensitive per-recipient data in GitHub.

## Completion requirements
- Installed Chatwoot v4.19.0 and AGE extension version evidenced, API GET endpoints tested.
- Verified Meta message IDs and event timestamps, exact CRM recipient-to-Chatwoot contact/attempt mapping.
- A secure, transactional Postgres ledger; reconciliation of sent-vs-delivered-vs-failed vs skipped; repeated polling without duplicates.
- No earlier EspoCRM extension, prior n8n workflow, or Chatwoot source changes without separate authorization.
- No real message sends without approved pilot test recipients and explicit live action.
