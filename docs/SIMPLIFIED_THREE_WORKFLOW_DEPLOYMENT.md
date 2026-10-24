# Current n8n import guide — 2 monitors + optional setup

**Updated 24 October 2026** · Target n8n 2.37.9 queue mode · Chatwoot v4.19.0 · EspoCRM.  
**This replaces the older 3-workflow / 7-workflow recommendations.** The current authority is [the 22-workflow inventory](../workflows/README.md). No existing deployed n8n workflows are changed by GitHub edits.

## Exactly what to import

| Order | File | How to operate |
|---|---|---|
| Optional one-time setup | [Data Tables setup](../workflows/age-dt-setup-managed-tables.json) | Only use when `AGE_Portfolio_Control` and `AGE_Dispatcher_Events` do not exist and weren't created from [CSV samples](../examples/n8n-data-tables/README.md). Run manually once. |
| 1 | [Unified 6-hour health monitor](../workflows/age-unified-six-hour-health-readonly.json) | Import inactive, choose existing EspoCRM/Chatwoot credentials, run manually. It reads managed Data Tables and reports `HOLD` (zero sends). After successful test, enable its optional six-hour schedule. |
| 2 | [AGE 07 WhatsApp Delivered/Read/Error analytics](../workflows/age-07-delivery-read-analytics-native.json) | Import inactive, choose Chatwoot credential, run manually. If Chatwoot's Enterprise campaign analytics is not entitled (401/403/404), leave its schedule disabled; that is a valid BLOCKED result. If authorized and working, an optional six-hour scan processes up to five native campaigns per run. |

**AGE 08** [provider evidence reducer](../workflows/age-08-verified-message-evidence-reducer.json) is **NOT an active fourth workflow**. It has no verified event collector, no durable cross-run ledger and no authenticated mapping to AGE attempts. It is developer-only.

**Do NOT additionally import** AGE 00 (earlier daily analytics), AGE 01–06 modular variants, earlier recipient reports, old API readiness variants, PostgreSQL-based workflows, or the old sending/reconciliation **design shells**. They all remain in GitHub for history. Their in-JSON names now begin with `[OLD]`, `[LEGACY SQL]`, `[ADVANCED SQL]` or `[DESIGN SHELL]`.

## Expected safety behavior

- Both current workflows are read-only and committed `active:false`.
- Unified health **never launches campaigns** or writes EspoCRM data; it reports only available controls, source health, and recorded events.
- AGE 07 returns Chatwoot campaign analytics **Delivered already inclusive of Read**. Read is a separate subset and must not be added to Delivered; a confirmed Read without separate Delivered still proves delivery.
- The code uses automatic campaign discovery, a bounded rotating scan, and a bounded failed-recipient breakdown. **Partial scans and unavailable provider analytics must not be described as complete reporting for every historical campaign.**
- AGE 07 does **not** synchronize individual provider delivery events into EspoCRM: the entitled campaign analytics API does not expose verified Meta message IDs/timestamps and AGE attempt linkage required by its event endpoint.
- n8n queue-mode Data Tables are fine for compact operational state; their row upserts do **not** constitute guaranteed atomic sending reservations.
- No custom PostgreSQL schema is required for this current read-only import; no native Chatwoot source modifications are made.

## Manual checklist

1. Verify Data Tables exist with correct column names/types; if created using demo CSVs, delete sample rows but retain the tables.
2. Import only the two **USE NOW** workflow JSON files. Optional setup must run first *only when tables are missing*.
3. Bind your existing credentials using n8n. Run both workflows manually and read all HOLD/BLOCKED reasons.
4. If Chatwoot analytics is not enabled or the list/metric calls fail, keep AGE 07 inactive and retain the unified diagnostic.
5. Enable schedules only after their manual executions pass. Do not enable earlier copies already imported to n8n; GitHub name changes don't update installed workflow titles automatically.
6. Treat read-only testing and import-CI success as separate from a live sender or persistent provider→EspoCRM reconciliation.

See [the source-verified 24-Oct reconciliation handoff](RECONCILIATION_WORKFLOWS_2026-10-24.md) and [Meta status reconciliation acceptance criteria](WHATSAPP_CAMPAIGN_DELIVERY_RECONCILIATION_REQUIREMENTS.md).
