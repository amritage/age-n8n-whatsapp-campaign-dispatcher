# AGE n8n Data Tables — demo CSV imports

**Prepared:** 23 October 2026 · **Data:** synthetic testing only · **Application:** n8n 2.37.9

These two files create the managed Data Table schemas required by [AGE's unified six-hour monitoring workflow](../../workflows/age-unified-six-hour-health-readonly.json). They are **not evidence of actual Meta limits, delivery events, consent or WABA health**.

| Required n8n Data Table name | CSV | Rows | Columns |
|---|---|---:|---:|
| `AGE_Portfolio_Control` | [AGE_Portfolio_Control_DEMO.csv](AGE_Portfolio_Control_DEMO.csv) | 20 | 16 |
| `AGE_Dispatcher_Events` | [AGE_Dispatcher_Events_DEMO.csv](AGE_Dispatcher_Events_DEMO.csv) | 34 | 9 |

## Import once

1. Open the **same n8n project** where you will import the AGE health workflow.
2. Go to **Data tables → Create Data table → Import CSV**. Import **one CSV per Data Table**, not both into one.
3. Choose the **exact Data Table names** shown above (without `_DEMO`).
4. Select **First row contains headers** and inspect every inferred column type against the definitions below **before confirming**.
5. Verify both tables and their columns in n8n. Once imported, run the [six-hour unified diagnostic](../../workflows/age-unified-six-hour-health-readonly.json) **manually first**. The workflow is read-only and should always return `mode=DRY_RUN`, `decision=HOLD`, and `canSend=false`.
6. After you have finished schema/testing checks, **delete the synthetic rows while preserving the two Data Tables**.

If a target Data Table already exists, **do not create a duplicate or overwrite real rows**. Check the target schema and decide whether a separate test project is safer. A CSV import into an existing table may append rows.

**Skip the separate** [Data Tables setup workflow](../../workflows/age-dt-setup-managed-tables.json) **if your CSV import successfully created both managed tables**. The setup workflow does not change an existing table's columns.

## Exact columns and n8n types

### AGE_Portfolio_Control — 16 columns

| Column | Type |
|---|---|
| `portfolioId` | String |
| `messagingTier` | Number |
| `tierVerifiedAt` | Date |
| `qualityVerifiedAt` | Date |
| `externalUsageVerifiedAt` | Date |
| `externalUnique24h` | Number |
| `rollingReserved24h` | Number |
| `masterSendingEnabled` | Boolean |
| `operatorLiveApproved` | Boolean |
| `providerAnalyticsVerified` | Boolean |
| `accountHealthVerified` | Boolean |
| `externalUsageUnknown` | Boolean |
| `unresolvedCycle` | Boolean |
| `activeCycleId` | String |
| `lastVerifiedBatchCompletedAt` | Date |
| `priorCycleHistoryVerified` | Boolean |

**Important:** Explicitly choose **Boolean** for all seven Boolean fields. CSVs use lowercase `true`/`false`; n8n's import type inference may not always select Boolean correctly.

### AGE_Dispatcher_Events — 9 columns

| Column | Type |
|---|---|
| `portfolioId` | String |
| `occurredAt` | Date |
| `errorCode` | String |
| `eventType` | String |
| `campaignId` | String |
| `batchId` | String |
| `state` | String |
| `count` | Number |
| `note` | String |

**Important:** `errorCode` is **String**, even when it contains numeric text such as `131049` or `131050`. Other identifiers are Strings as well. Blank cells intentionally exercise missing/unknown values and should not be forced to zero or `false`.

n8n creates its own `id`, `createdAt`, and `updatedAt` system columns; these CSVs do **not** include them. Timestamps use UTC ISO 8601 with a `Z` suffix.

## Demo scenarios covered

**Portfolio Control (20 rows):** master-off and approval-off; mismatch between master and approval; analytics unavailable; account health unavailable; unknown/stale tier; stale quality; missing/stale external usage; active cycle; unverified prior cycle; 25h, 26h and 27h last-completion cases; zero/partial headroom; large tier; verified first-cycle history; and missing reservation evidence.

**Dispatcher Events (34 rows):** Meta error codes `131050`, `131049`, `131048`, `131026`, `130472`, and `132015`; nonnumeric errors; RESERVED, QUEUED, SUBMITTED, SUBMISSION_UNKNOWN, SENT, DELIVERED, READ, SKIPPED, EXCLUDED, PROCESSING, PROCESSING_COMPLETE, SETTLED, HOLD, DRY_RUN and UNKNOWN; zero and aggregated counts; stale history; and read-only account-health observations.

These deliberately include **bad or incomplete states** to test the monitor's fail-closed behavior. They are **not valid operational configuration** and should not be copied into a live sending ledger.

## Delete demo records after testing

For `AGE_Portfolio_Control`, delete **only rows whose `portfolioId` starts with `DEMO_ONLY_`**.

For `AGE_Dispatcher_Events`, delete **only rows whose `note` starts with `DEMO_DELETE_AFTER_TEST`**.

If you imported these CSVs into an otherwise empty table, deleting all the 20 / 34 sample rows is fine. **Keep both Data Tables and their column definitions.** Never delete genuine records merely because they coexist in a table.

A demo record cannot authorize sending. The latest unified monitor has **no send/create/CRM-write nodes** and always reports HOLD. Do not use the synthetic portfolio tier, account health, consent, or Meta delivery data to justify a real campaign launch.

## Date caveat

The sample timestamps are intentionally anchored to **23 October 2026**. If you import them later, n8n may correctly flag more rows as stale under 24-hour evidence freshness requirements. That is an expected safety outcome, not a failed CSV import.

## Related

- [Recommended three-workflow setup](../../docs/SIMPLIFIED_THREE_WORKFLOW_DEPLOYMENT.md)
- [n8n managed Data Tables storage decision](../../docs/DATA_TABLE_STORAGE_DECISION.md)
- [Independent pre-import safety checks](../../docs/PRE_N8N_IMPORT_CHECKLIST.md)
