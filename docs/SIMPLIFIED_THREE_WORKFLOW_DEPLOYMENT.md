# Simplified AGE Dispatcher diagnostics — 3 workflows, 2 recurring schedules
**Decision:** 23 October 2026. Targets: n8n 2.37.9 queue mode, Chatwoot v4.19.0, EspoCRM and built-in n8n Data Tables.

## Recommended import list (only 3 files)

| Order | Importable JSON | When to run | Responsibility |
|---|---|---|---|
| 1 | [`age-dt-setup-managed-tables.json`](../workflows/age-dt-setup-managed-tables.json) | **Once, manually** | Creates/reuses `AGE_Portfolio_Control` and `AGE_Dispatcher_Events`, managed entirely by n8n. **Does not seed a portfolio or enable sending.** |
| 2 | [`age-unified-six-hour-health-readonly.json`](../workflows/age-unified-six-hour-health-readonly.json) | **Every 6h** after first manual test | ONE operational report: EspoCRM campaign inventory/configuration, native Chatwoot WhatsApp campaign counts, portfolio health/26-hour cycle/rolling-use evidence, recorded Meta error codes and Data Table rollups; concludes `decision:HOLD` and `canSend:false` |
| 3 | [`age-00-chatwoot-analytics-capability.json`](../workflows/age-00-chatwoot-analytics-capability.json) | **Every 24h** after first manual test | Independent, low-cost, feature-gated Chatwoot analytics GET (metrics for an existing one-off WhatsApp campaign). The result is PASS, BLOCKED (e.g. 403 or connection denied), or UNVERIFIED (no existing campaign). No campaign created. |

**Result:** Seven recommended imports become **three**; six scheduled diagnostics become **two active schedules** (6h and 24h). Once setup is done, only two recurring workflows require daily management.

### Why 24h and 6h are not merged into one schedule

The daily native Chatwoot analytics check is endpoint- and entitlement-dependent. It does not need to run four times per day, while campaign inventory, portfolio holds and lightweight errors benefit from the six-hour cadence. Keeping this **one** independent probe prevents its failure (401/403/404 or no campaign) from interfering with routine operational monitoring. This is a conscious fault-isolation decision; fewer workflows are not automatically safer.

All high-cost or potentially mutable tasks, such as full recipient reconciliation, campaign creation, contact/label updates and sending, remain **separate future phases**—not hidden in the simplified diagnostics.

## Normal six-hour execution

```text
Manual Trigger / Schedule every 6h
   → EspoCRM native Campaign Get All (selected metadata)
   → summarize CRM counts + flags
   → Chatwoot native Campaign Get All
   → summarize provider WhatsApp batches
   → Data Table AGE_Portfolio_Control Get (LIMIT 51)
   → Data Table AGE_Dispatcher_Events Get (LIMIT 3001; most recent first)
   → one consolidated HOLD-only report
```

Data Table reads use `resource=row`, `operation=get`, official `n8n-nodes-base.dataTable` v1.1, select table **By Name**, with no custom SQL or proprietary HTTP Request nodes. `continueOnFail=true` on the source reads and `alwaysOutputData=true` allow structured blocked reports for ordinary API errors and no-row cases. A Code-node exception (such as invalid duplicate CRM IDs or malformed event counts) intentionally fails the run rather than presenting incomplete figures as trustworthy.

**The output is a diagnostic snapshot, not live send authorization**: it always includes `mode:DRY_RUN`, `decision:HOLD`, `canSend:false`, `createdCampaigns:0`, and `crmEventsWritten:0`.

### Data safety and operational limits

- `AGE_Portfolio_Control`: at most **50 rows** evaluated; the 51st causes an explicit incomplete-scan blocker. The setup schema includes `priorCycleHistoryVerified`; when reusing an existing table, **review the columns manually**, as the n8n create-if-not-exists operation will not alter that schema.
- `AGE_Dispatcher_Events`: at most **3,000 rows** evaluated; the 3,001st causes a blocker, not silent truncation. Read the most recently recorded rows first. Aggregate errors and operational statuses only. Event table may be empty when no ingestion has been added; it does not prove zero provider failures.
- Recipient opt-out `131050` is **hard marketing suppression**; `131049` keeps existing CRM retry timing; `131026` is ambiguous, not proof of an unregistered WhatsApp number.
- Campaigns respect separate constraints (the global 26-hour cycle completion gap, Sunday/daytime windows, 7-day recipient min gap, delivered goal, independent attempt/Meta portfolio capacity and cost constraints), but the **complete send authorization logic and durable recipient evidence are not yet implemented**. The report explicitly identifies unverified requirements.
- Even if a user sets all n8n Data Table flags true, the monitor **cannot send**. This is important because Data Table upserts are **not** sufficient for queue-mode atomic deduplication. No new PostgreSQL schema has been applied to n8n's application DB.
- API credentials are selected inside n8n after import. No Campaign IDs, API tokens or URLs are embedded. All workflows are **inactive by default**. Check community nodes and tables inside the **same n8n project**.

## Differences from previous 7-workflow pack

| Previously recommended workflow | Status with this consolidation |
|---|---|
| `age-01-espo-campaign-preflight.json` | Merged into 6h health |
| `age-02-portfolio-preflight-datatable.json` | Merged into 6h health |
| `age-04-meta-error-watch-datatable.json` | Merged into 6h health |
| `age-05-operations-dashboard-datatable.json` | Merged into 6h health |
| `age-06-global-cycle-dry-run-datatable.json` | Merged into 6h health |
| `age-00-chatwoot-analytics-capability.json` | Retained, daily, with error handling improved |
| `age-dt-setup-managed-tables.json` | Retained, manual once |

**Do not import the five former standalone files** when importing the simplified monitor. They remain in GitHub for historical compatibility with tests/documentation; importing them as well would create redundant schedules and scans. Existing *production* AGE Campaign Management/n8n/Chatwoot instances are not modified by these GitHub changes.

## Manual deployment sequence

1. Download/import only the **three** files above into a dedicated n8n project. Setup must be executed manually before the six-hour monitor. If tables already exist, inspect all columns and `priorCycleHistoryVerified` before proceeding. Do not fill them with invented Meta values.
2. Attach existing `@traien/n8n-nodes-espocrm` and `@renatoascencio/n8n-nodes-chatwoot` credentials in the six-hour monitor, and Chatwoot credential in the daily probe.
3. **Execute manually**: the 6h output should show CRM inventory, Chatwoot counts, portfolio holds, recorded event status and zero sends. For an empty `AGE_Portfolio_Control`, `NO_PORTFOLIO_CONTROL_ROWS` is expected and safe.
4. Run daily capability probe manually. If no native WhatsApp campaign exists, expect UNVERIFIED. If the feature is unavailable or the Campaign GET fails, expect BLOCKED. Do not create a live campaign merely to satisfy this diagnostic.
5. Activate the two schedules **only if read-only manual tests succeed**. No need to activate the Setup workflow; it has no schedule. Verify the actual timezone is `Asia/Kolkata`.
6. Never activate the older standalone monitors simultaneously without a deliberate reason.

## Test standard

GitHub Actions tests:
- Synthetic Code-node executions for empty/filled Data Tables, 25-hour vs 27-hour gap, 131050 hard marketing opt-out, unknown provider usage, denied APIs and 51/3001 record scan overflow.
- Node types and all graph connections, only read operations and no credentials in exported JSON.
- Actual **disposable n8n 2.37.9 CLI workflow JSON import** of all repo workflows.
- Legacy PostgreSQL reference tests run **only in CI** and are irrelevant to n8n Data Tables import.

**Not yet verified:** actual execution on your n8n queue workers; Chatwoot enterprise analytics entitlement and date/ID output shape; live EspoCRM API access; provider event reconciliation. This is a **safe diagnostics pack, not an operational LIVE WhatsApp dispatcher**.
