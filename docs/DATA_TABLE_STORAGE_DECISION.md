> **2026-10-23 consolidation:** Data Table storage decision remains valid, but the operational imports are now reduced to [three workflows](SIMPLIFIED_THREE_WORKFLOW_DEPLOYMENT.md). Previous individual WF-02/04/05/06 files are retained only as standalone reference variants.

# Decision: n8n-managed Data Tables as the default operational store (23 October 2026)

## Decision

User prefers **n8n Data Tables** to adding `age_dispatcher` tables to the n8n application database, because future n8n migrations/upgrades should not need custom database maintenance. **Accepted for diagnostics, lightweight configuration, campaign checkpoints and operational rollups.**

The custom PostgreSQL DDL at `sql/dispatcher-control-plane.sql` is now classified as an **OPTIONAL future high-integrity production reservation reference**, not a prerequisite for any current manual read-only diagnostic or global dry run. **DO NOT apply this SQL to n8n's own application tables, the Chatwoot database or EspoCRM.** No database migration has been run.

### Why this is safer for upgrades

The built-in `n8n-nodes-base.dataTable` supports Table Create, Row Get, Row Upsert, and resource-locator **By Name**, verified from the **n8n@2.37.9 release source**. n8n manages its own Data Table tables/migrations. We do not query or alter n8n's internal SQL structure.

Source:
- https://github.com/n8n-io/n8n/blob/n8n%402.37.9/packages/nodes-base/nodes/DataTable/actions/table/create.operation.ts
- https://github.com/n8n-io/n8n/blob/n8n%402.37.9/packages/nodes-base/nodes/DataTable/actions/row/get.operation.ts
- https://github.com/n8n-io/n8n/blob/n8n%402.37.9/packages/nodes-base/nodes/DataTable/common/fields.ts
- https://docs.n8n.io/build/work-with-data/data-tables

**Important distinction:** A separate PostgreSQL `age_dispatcher` schema would **not ordinarily be modified by n8n's application migrations** either. Its main disadvantages are manual backup/schema maintenance and a larger operator surface. A separately administered database on the same PostgreSQL server could provide stronger isolation if future live transaction requirements justify it. Do not assume application-managed Data Tables eliminate backup/version-upgrade risks.

## New default files

Import all files **as new inactive workflows**. They use built-in Data Table **By Name** lookup, so no table IDs or campaign IDs must be edited in Code nodes.

| Order | File | Requires custom SQL | Actions |
|---|---|---|---|
| 1 | `workflows/age-dt-setup-managed-tables.json` | NO | Manual-only, creates or reuses two n8n-managed data tables. This is a **table creation** action inside n8n, not an application DB schema migration. Safe to run once after review; existing columns must still be checked |
| 2 | `workflows/age-02-portfolio-preflight-datatable.json` | NO | Built-in Data Table Get `AGE_Portfolio_Control` → fail-closed portfolio evidence report |
| 3 | `workflows/age-04-meta-error-watch-datatable.json` | NO | Built-in Data Table Get `AGE_Dispatcher_Events` → last-30-day **recorded** error-code summary |
| 4 | `workflows/age-05-operations-dashboard-datatable.json` | NO | Two native Data Table Get operations → lightweight operational rollups |
| 5 | `workflows/age-06-global-cycle-dry-run-datatable.json` | NO | Existing community EspoCRM and Chatwoot Campaign Get All → Data Table Get → **DRY_RUN HOLD; no sends** |

Other previously built native workflows `age-00-chatwoot-analytics-capability.json` and `age-01-espo-campaign-preflight.json` require no Postgres setup either.

The earlier `age-02-postgres-portfolio-preflight.json`, `age-04-meta-error-watch.json`, `age-05-operations-dashboard.json`, `age-06-global-cycle-dry-run.json` continue to exist as **legacy/advanced SQL-based alternatives**, but are **NOT** recommended for the current import. Do not use them alongside the Data Table variants against separate, unsynchronized ledgers.

## Managed Data Table schemas

`AGE_Portfolio_Control` (one operator-verified row per Meta business portfolio):
`portfolioId` String; `messagingTier` Number; `tierVerifiedAt` Date; `qualityVerifiedAt` Date; `externalUsageVerifiedAt` Date; `externalUnique24h` Number; `rollingReserved24h` Number; `masterSendingEnabled` Boolean; `operatorLiveApproved` Boolean; `providerAnalyticsVerified` Boolean; `accountHealthVerified` Boolean; `externalUsageUnknown` Boolean; `unresolvedCycle` Boolean; `activeCycleId` String; `lastVerifiedBatchCompletedAt` Date.

`AGE_Dispatcher_Events` (summarized and intentionally low-volume, no personal data):
`portfolioId` String; `occurredAt` Date; `errorCode` String; `eventType` String; `campaignId` String; `batchId` String; `state` String; `count` Number; `note` String.

- Table creation via the official node uses `createIfNotExists:true`; this **does not migrate/fix incorrect schemas** of previously created tables. Review the columns if reusing a table.
- Setup does **not** seed operator approvals, provider limits or consent. No row = **BLOCKED**, not unlimited capacity.
- Do not store secrets, phone numbers, BSUIDs, recipient names or individual Meta message payloads in these shared Data Tables.
- Team members in the n8n project may be able to read/edit these values. **Treat them as untrusted operational observations, never final authorization to send.**
- On n8n **2.37.9**, the source default total Data Tables size is **200 MiB** (`N8N_DATA_TABLES_MAX_SIZE_BYTES` can override it); keep events summarized and archived, not one row per message. Check the actual instance setting when deployed.

## Boundary: Data Tables are NOT a safe multi-worker distributed claim ledger

They support Row Upsert and existence checks for convenience, but the official Data Table node has **no declarative per-field UNIQUE constraints or multi-table transaction / SELECT FOR UPDATE facility**. With multiple n8n queue workers, two runs can race on a campaign, consent snapshot or recipient reservation. No app-level `upsert` should be taken as an exactly-once send guarantee.

Therefore **ALL new workflows in this pack are READ-ONLY except the explicit manual Data Tables setup workflow; no sending operations are included.**

Before production live sending, we must choose a provably durable, atomic reservation approach:
- Preferred: **separate application PostgreSQL database or schema with guarded transaction and unique reservation key**, isolated from n8n's internal tables; it can be on the same PostgreSQL server, with its own restricted credential and backups.
- Alternative, only after rigorous queue-mode tests: serial single-writer dispatch + Redis coordination **plus a separately validated durable idempotency mechanism**. A Redis TTL lock alone is *not* enough for exactly-once external provider creation/recovery.
- If you reject any strong atomic reservation layer, there should be **no fully autonomous live multi-campaign sender**; stay with DRY RUN until a safe mechanism is agreed.

## Upgrade and maintenance

1. Back up n8n's PostgreSQL DB including Data Tables, workflow definitions and credential encryption key (securely, separately). Data Tables are application-managed but still need backups.
2. Export limited Data Tables to CSV before major upgrades (without personal data), inspect API/node release notes and test imports in an isolated n8n 2.37.9+ staging instance.
3. Keep setup and diagnostics in a dedicated n8n project with restricted members; never grant general users write permissions on approval flags.
4. Monitor storage warnings and failure status on any insert/upsert; do not allow a storage-full error to implicitly authorize sending.
5. Test actual queue-worker behavior after upgrades; importing a JSON workflow only validates shape, not live node execution.

**No previous AGE extension, old workflow or production database was changed by this repository update.**
