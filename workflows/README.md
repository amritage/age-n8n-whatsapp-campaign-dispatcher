**NEW (24 Oct):** [AGE 03 recipient source-evidence manual pilot](../docs/RECIPIENT_EVIDENCE_PAGING_AND_MATCHING_2026-10-24.md) has replaced its former advanced-SQL version **in the same file**. It is **development-only, inactive, manually paginated, and contains private recipient identifiers**. Do not mistake it for a third active six-hour workflow. AGE 07 remains your proven aggregate monitor.

# AGE workflows: official import status and complete inventory

**There are 22 workflow JSON files. Import only the two current read-only diagnostic workflows, plus one optional setup workflow if you have not already created the Data Tables from CSV.** Two additional workflows are development-only: **AGE 03** is a manual, sensitive recipient-evidence page (requires Chatwoot PostgreSQL SELECT on contacts; do not schedule), and **AGE 08** is a disconnected message-event reducer. The other **17** are superseded versions, advanced SQL/HTTP alternatives, or inert shells.

All 22 JSON files are committed with `active: false`. None is a live Meta sender or complete recipient-level EspoCRM delivery reconciler.

## Use now: only two scheduled diagnostic workflows

| Status | File | Why |
|---|---|---|
| **USE NOW — READ ONLY** | [`age-unified-six-hour-health-readonly.json`](age-unified-six-hour-health-readonly.json) | Cross-system six-hour diagnostic; import inactive and manually test before scheduling |
| **USE NOW — READ ONLY** | [`age-07-delivery-read-analytics-native.json`](age-07-delivery-read-analytics-native.json) | New DB-based account-2 native WhatsApp campaign snapshots; **manual pilot only until PostgreSQL credentials/licensing approved** |

**Recommended schedules:** Both read-only monitors can run every 6 hours. Activate them separately only after manual tests. AGE 07 no longer calls the 401-blocked analytics API: it needs authorized **Chatwoot PostgreSQL SELECT-only** access to campaigns, campaign_recipients and inboxes. Keep its schedule disabled until permission/licensing checks and sample-count tests pass. The unified monitor can continue independently. **Do not also enable AGE 00 or the older recipient-report variants.**

## Optional or development only

| Status | File | Instruction |
|---|---|---|
| **OPTIONAL SETUP** | [`age-dt-setup-managed-tables.json`](age-dt-setup-managed-tables.json) | One-time Data Tables creator; skip when CSV-created tables already exist |
| **DEV ONLY — NOT CONNECTED** | [`age-08-verified-message-evidence-reducer.json`](age-08-verified-message-evidence-reducer.json) | Not deployable alone; requires verified event producer and persistent reconciliation |

**CSV-first option:** Create `AGE_Portfolio_Control` and `AGE_Dispatcher_Events` from the [sample CSV instructions](../examples/n8n-data-tables/README.md), verify column types, then remove demo rows. **Skip** the table-creation JSON if the tables already exist correctly.

**AGE 08 limitation:** It is a pure reducer for independently authenticated and validated provider messages within one call. It does **not** receive real webhooks, persist an event ledger or write to EspoCRM. Do not mistake it for an operating reconciliation workflow.

## Older files: do not import into the recommended setup

| Status | File | Replaced by / reason |
|---|---|---|
| [OLD - REPLACED BY AGE 07] | [`age-00-chatwoot-analytics-capability.json`](age-00-chatwoot-analytics-capability.json) | Capability probe superseded by AGE 07 |
| [OLD - MERGED INTO UNIFIED] | [`age-01-espo-campaign-preflight.json`](age-01-espo-campaign-preflight.json) | Stand-alone CRM preflight |
| [OLD - MERGED INTO UNIFIED] | [`age-02-portfolio-preflight-datatable.json`](age-02-portfolio-preflight-datatable.json) | Stand-alone managed-table portfolio preflight |
| [LEGACY SQL - DO NOT IMPORT] | [`age-02-postgres-portfolio-preflight.json`](age-02-postgres-portfolio-preflight.json) | Old PostgreSQL portfolio preflight |
| [DEV ONLY - READ ONLY] | [`age-03-chatwoot-evidence-readonly.json`](age-03-chatwoot-evidence-readonly.json) | New **manual-only** recipient-level keyset paging: current mobile, wamid, Delivered/Read/Failed timestamps and Meta codes. Source evidence only; no verified CRM mapping or writes. |
| [OLD - MERGED INTO UNIFIED] | [`age-04-meta-error-watch-datatable.json`](age-04-meta-error-watch-datatable.json) | Stand-alone error monitor |
| [LEGACY SQL - DO NOT IMPORT] | [`age-04-meta-error-watch.json`](age-04-meta-error-watch.json) | Old PostgreSQL error monitor |
| [OLD - MERGED INTO UNIFIED] | [`age-05-operations-dashboard-datatable.json`](age-05-operations-dashboard-datatable.json) | Stand-alone operations dashboard |
| [LEGACY SQL - DO NOT IMPORT] | [`age-05-operations-dashboard.json`](age-05-operations-dashboard.json) | Old PostgreSQL dashboard |
| [OLD - MERGED INTO UNIFIED] | [`age-06-global-cycle-dry-run-datatable.json`](age-06-global-cycle-dry-run-datatable.json) | Stand-alone global dry run |
| [LEGACY SQL - DO NOT IMPORT] | [`age-06-global-cycle-dry-run.json`](age-06-global-cycle-dry-run.json) | Old PostgreSQL dry run |
| [OLD - REPLACED BY UNIFIED] | [`age-api-readiness-native.json`](age-api-readiness-native.json) | Earlier native Chatwoot/Espo inventory |
| [OLD HTTP - DO NOT IMPORT] | [`age-api-readiness-readonly.json`](age-api-readiness-readonly.json) | Earlier generic HTTP API check |
| [DESIGN SHELL - NOT RUNNABLE] | [`age-chatwoot-campaign-reconciliation.json`](age-chatwoot-campaign-reconciliation.json) | Unfinished reconciliation design shell |
| [OLD - AUTO DISCOVERY IN AGE 07] | [`age-chatwoot-find-campaign-ids-readonly.json`](age-chatwoot-find-campaign-ids-readonly.json) | Obsolete manual campaign lookup |
| [OLD - REPLACED BY AGE 07] | [`age-chatwoot-recipient-report-native.json`](age-chatwoot-recipient-report-native.json) | Earlier native recipient report |
| [OLD HTTP - DO NOT IMPORT] | [`age-chatwoot-recipient-report-readonly.json`](age-chatwoot-recipient-report-readonly.json) | Earlier generic HTTP recipient report |
| [DESIGN SHELL - NOT RUNNABLE] | [`age-multi-campaign-cycle-controller.json`](age-multi-campaign-cycle-controller.json) | Unfinished multi-campaign sender design shell |

## Rules that prevent confusion

1. **Do not bulk-import all 22 files.** The CI importer checks compatibility, not recommended deployment.
2. The lifecycle prefix is now part of the workflow **name visible after import into n8n**. Repository edits do **not** automatically rename earlier copies already installed in your n8n instance; review old imported workflows manually and disable redundant schedules. Never delete or overwrite production workflows automatically.
3. AGE 07 is an **inactive read-only SQL replacement** of the previous paid-endpoint version. It has not been executed against the live n8n credential, does not store Data Table summaries and does not perform EspoCRM writes. See [SQL deployment checklist](../docs/SIMPLIFIED_THREE_WORKFLOW_DEPLOYMENT.md) and [field-level evidence](../docs/CHATWOOT_ANALYTICS_DISCOVERY_2026-10-24.md). Current workflows are safe for **read-only manual tests once licensed/authorized**, not reliable live Meta delivery-to-EspoCRM syncing. Verified Meta message ID, campaign/recipient/attempt mapping and durable idempotent EspoCRM writes remain outstanding.
4. The [machine-readable index](WORKFLOW_STATUS.json) lists every workflow and its status; CI fails if a new workflow is unclassified or a current monitor adds writes.
5. Before importing, review the [verified PostgreSQL evidence](../docs/CHATWOOT_ANALYTICS_DISCOVERY_2026-10-24.md). AGE 07 now counts statuses 3+4 as Delivered inclusive of Read, retaining separate Read count; no double-counting. The older handoff describes the previous Enterprise-API workflow and is historical.
