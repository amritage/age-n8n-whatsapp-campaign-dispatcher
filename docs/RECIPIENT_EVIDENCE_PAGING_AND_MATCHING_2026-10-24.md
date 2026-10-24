# AGE 03 recipient evidence and guarded EspoCRM mapping — development handoff

**Status (24 October 2026):** Workflow and synthetic tests committed; **no live AGE 03 test or CRM write enabled**. This reuses one of the existing **22** workflow files. AGE 07 remains the live-validated, aggregate-only monitor.

## What is built

1. **[AGE 03: manual recipient page](../workflows/age-03-chatwoot-evidence-readonly.json)**: Reads Chatwoot account 2, native WhatsApp one-off campaign recipient rows from the same working private PostgreSQL credential as AGE 07. Returns **mobile number, Chatwoot campaign/contact/inbox/recipient row identifiers, provider-message `wamid`, status, Sent/Delivered/Read/Failed timestamps, raw Meta error code/title/message, and update timestamp**. This is a **current-state snapshot**, not a complete provider webhook ledger. It does not need enterprise analytics HTTP endpoints.
2. **[Recipient-page validation tests](../tests/recipient-page-workflow.test.js)**: check Read implies delivery, no double-counting, 131026 preserved, invalid IDs, partial evidence, duplicate row, fail-closed tenant mismatch, and manual-only/no-write behavior.
3. **[PostgreSQL SQL fixture](../tests/chatwoot-recipient-page-sql.test.js)**: tests real parameterized, ordered, account+WhatsApp-scoped SQL against synthetic Postgres 16 fixtures; never connects to production.
4. **[Authoritative attempt candidate mapper](../src/recipient-outcome-candidates.js)** and [test](../tests/recipient-outcome-candidates.test.js): pure adapter prepares stable SHA-256 event IDs from the already existing `src/evidence-mapper.js` **only** when an independent authoritative link proves campaign/account/contact/inbox/Meta message ID and EspoCRM campaign/recipient/attempt identity. Otherwise it returns `HOLD/UNMATCHED`. All candidate events retain `canWrite:false`, `espocrmWrites:0`; no network calls or mutations.

### Workflow safety

- Manual Trigger only; **no schedule, sends, EspoCRM node, HTTP, Data Table writes or raw SQL writes**.
- n8n Postgres node uses query parameters `$1..$4`, not string interpolation. `typeVersion:2.5` for n8n 2.44.6; `options.queryReplacement` passes `[accountId, UTC cursor, row ID, page size]` as an expression array.
- The n8n credential must be dedicated `age_chatwoot_analytics_ro`, privately configured in n8n, and have SELECT on `campaigns`, `campaign_recipients`, `inboxes` and **`contacts`**. This last grant is the only difference from AGE 07's three-table requirement.
- Sensitive data stays in a private, human-authorized n8n execution; **never paste the JSON output (real phone numbers or wamids) in GitHub, CI, screenshots or public chats.** n8n export has `saveDataSuccessExecution=none`, `saveDataErrorExecution=none` and `saveManualExecutions=false`. These limits do not remove information from the current live manual-execution UI.
- Chatwoot enterprise-associated table access must be compatible with the user's actual license; SELECT permissions alone do not establish entitlement. The workflow does not bypass feature restrictions.

## First manual test after authorization

In Coolify PostgreSQL terminal, an administrator can verify grants *without disclosing contacts*:

```sql
SELECT
 has_table_privilege('age_chatwoot_analytics_ro','public.contacts','SELECT') AS can_read_contacts,
 has_table_privilege('age_chatwoot_analytics_ro','public.campaign_recipients','UPDATE') AS can_update_recipients;
```

Expected `true`, `false`. If contacts SELECT is missing, an authorized administrator can run:

```sql
GRANT SELECT ON TABLE public.contacts TO age_chatwoot_analytics_ro;
```

Import **only as a separate inactive manual development workflow**, with the existing AGE 03 path from the repo. The current production AGE 07 is **not modified or replaced**. Set the Postgres node credential to the already working **Chatwoot Postgres**. **Do not Publish/Activate** AGE 03.

In `Configure Account and Keyset Cursor`, the first run is:

```js
{chatwootAccountId:2,afterUpdatedAt:'1970-01-01T00:00:00.000Z',
 afterRowId:'0',pageSize:250}
```

Select Manual Trigger and Execute Workflow. The final node provides a **private page** `records[]` and `hasMore`. If `hasMore=true`, copy the output's `nextCursor.updatedAt` and `nextCursor.rowId` into the **same** configuration node and execute the next page. Continue until `hasMore=false` (up to five pages for the earlier 910-row historical sample at 250 per page; approximately four pages if rows remain unchanged). Do not run two pages concurrently with a shared cursor; do not confuse a single valid page with complete historical coverage.

**Important limitation:** New/updated recipient rows can move later in the ordering while pages are in progress. These manual scans are *best effort* with an ordered keyset, not transactional snapshots or exactly-once checkpoints. Future production reconciliation needs durable cursors, overlap/rescan windows and idempotent event storage. The page limit includes one extra row only to calculate `hasMore`, then returns at most 250 rows.

### Status semantics

| Chatwoot status integer | Meaning | Our interpretation |
| ---: | --- | --- |
| 0 | Queued | Not sent |
| 1 | Skipped | Not sent |
| 2 | Sent | Submitted/sent; not proof of delivery |
| 3 | Delivered | Delivered confirmed |
| 4 | Read | Delivered **and Read** confirmed once |
| 5 | Failed | Preserve raw code and timestamp |

`currentMobileDigits` comes from **current** Chatwoot `contacts.phone_number`; it is **not guaranteed to be the historical recipient phone**. One name, phone number or contact ID alone is **not enough** to link an EspoCRM attempt. `providerMessageId` matching `wamid.` is a **format check** only; it does not prove provider provenance. No source timestamps are invented when missing, and no assumption is made that `131026` proves unregistered.

### Required mapping before EspoCRM writes

Persist a separately approved, independently verified relationship:

`AGE campaign ID + AGE recipient ID + immutable AGE attempt ID ↔ Chatwoot account + internal/display campaign + inbox + contact + message wamid`

The mapper rejects missing/unverified/ambiguous relationships. The approved live destination needs verified installed EspoCRM extension endpoints, write-level authorization, durable deduplication and idempotent event acceptance, original sender/campaign isolation, status precedence, opt-outs and retry policies, and manual dry-run reconciliation before any live write. **None of those live integrations is claimed implemented.**

## Not included in this development commit

- No changes to Chatwoot source, PostgreSQL schema, Coolify networking, running n8n workflows, EspoCRM fields/extensions or GitHub credentials.
- No automatic schedule, message sending, Data Table upsert, CRM update or production attempt link.
- No claim of exact Meta provider event timestamps beyond those recorded by Chatwoot.
- No change to existing sender-wide 26-hour spacing, Sunday exclusion, daily caps or 131049 retry rules.

The goal is to verify *per-recipient source evidence first*, then build **one** controlled mapping/reconciliation path instead of proliferating independent scheduled workflows.

**Related:** [verified Chatwoot field guide](CHATWOOT_ANALYTICS_DISCOVERY_2026-10-24.md) · [API adapter contract](ESPOCRM_CHATWOOT_API_CONTRACT.md) · [network recovery runbook](CHATWOOT_N8N_PRIVATE_NETWORK_RUNBOOK_2026-10-24.md).
