> **Storage design update — 23 October 2026:** Use the [n8n-managed Data Tables design and SQL-free import guide](DATA_TABLE_STORAGE_DECISION.md) for new diagnostics. The earlier custom PostgreSQL schema and Postgres WF-02/WF-04/WF-05/WF-06 are now **optional advanced/legacy examples**, not required for the recommended import. Managed Data Tables are not atomic locks; all these workflows remain non-sending.

# AGE dispatcher workflow pack — v2026-10-23 (Chatwoot 4.19.0)

## What is delivered

**Seven NEW importable, fail-closed n8n workflows** (plus previously delivered native Chatwoot diagnostic reporting and two pre-existing, non-sending future architecture shells). Created for **n8n 2.37.9 queue mode, EspoCRM, Chatwoot 4.19.0 and PostgreSQL 16**. All seven use installed native EspoCRM/Chatwoot community nodes or n8n's built-in Postgres node, with no generic HTTP Request node and **no manually entered campaign ID**.

| Workflow file | Frequency if operator later activates | Access and job | Read/write status |
|---|---|---|---|
| **`age-00-chatwoot-analytics-capability.json`** | 24h | Chatwoot native Campaign Get Many then sample Campaign Get Metrics. Determines whether native Enterprise analytics is actually entitled; a failed API returns BLOCKED. | Read-only; does **not** claim entitlement without test |
| **`age-01-espo-campaign-preflight.json`** | 1h | EspoCRM native Custom Entity Get All Campaigns (selected fields), evaluates Active/provider/template metadata and emits non-sensitive blockers. | Read-only; **not** a fresh per-recipient consent/segment verification |
| **`age-02-postgres-portfolio-preflight.json`** | 1h | n8n built-in Postgres SELECT against private `age_dispatcher.preflight_view`; displays operator approval, Meta tier/quality evidence, unknown external sends, 26h gap and capacity holds. | Read-only; view **always outputs `can_send=false`** |
| **`age-03-chatwoot-evidence-readonly.json`** | 6h | Optional built-in Postgres SELECT on Chatwoot's **enterprise** `campaign_recipients` and `campaigns` tables, **aggregates only**, counts possible `wamid.` source IDs and terminal statuses. | Read-only; requires dedicated Chatwoot DB **SELECT-only** role; blocked if enterprise table unavailable |
| **`age-04-meta-error-watch.json`** | 6h | Built-in Postgres SELECT from the private ledger; classifies codes including 131050 permanent marketing opt-out, 131049 per-user marketing hold, 131026 ambiguous and 131048 quality restriction. | Read-only; **does not yet apply CRM suppression writes** |
| **`age-05-operations-dashboard.json`** | 6h | Built-in Postgres SELECT aggregated state across portfolios/cycles/batches/recipients. | Read-only; not a provider-verified Meta billing/delivery report |
| **`age-06-global-cycle-dry-run.json`** | 1h | Consolidated native EspoCRM Campaign Get All → Chatwoot Campaign Get All → private Postgres global portfolio holds → **HOLD decision**. A convenient single-workflow entry point. | **DRY RUN only**, explicitly emits `canSend:false`, creates zero campaigns |

The previously provided `age-chatwoot-recipient-report-native.json` uses five rotating recent Chatwoot campaigns, native metrics and failed-only recipient retrieval, and may be useful **only if** the analytics entitlement check passes. It is a diagnostic, **not** exhaustive recipient history or CRM event synchronization.

## PostgreSQL control-plane schema (new; NOT deployed automatically)

`sql/dispatcher-control-plane.sql` defines private `age_dispatcher` schema with:
- `portfolio` Meta messaging tier/quality/external-usage timestamps, master stop switch and operator approval (disabled/unknown by default)
- `cycle` with reservation, launching/unknown and settlement states, explicit receipt-settlement boundary
- `batch` with unique immutable label, Chatwoot campaign display ID, source CRM campaign ID, SHA-256 payload
- `reservation` containing only opaque HMAC recipient identity keys (`PHONE` or `BSUID`), AGE recipient ID and, when verified, provider message ID/event timestamp
- `control_audit` and an always-fail-closed `preflight_view` which checks tier quality/usage freshness, active/unresolved cycles and global 26h completion gap

**The schema deliberately does not implement an auto-sending/reserve function or set capacity values.** Creating a table or setting a tier value does not authorize dispatch. Do not connect SQL to Chatwoot's production DB. All existing extensions and workflows remain unchanged.

### One-time setup in n8n

1. Import **WF-00** and **WF-01** as new inactive workflows and bind your already installed Chatwoot and EspoCRM credentials. Neither asks for a campaign ID. Manually execute them first. The first workflow may return UNVERIFIED if there is no native Chatwoot WhatsApp one-off campaign; do not create a live campaign merely for diagnostics.
2. For WF-02, WF-04 and WF-05, first review and deliberately apply `sql/dispatcher-control-plane.sql` to a **separately designated private PostgreSQL database/schema** (existing n8n Postgres database or a dedicated DB with separate role); apply backup/privilege review. Use a SELECT-only n8n database credential on the built-in Postgres nodes. An empty ledger intentionally returns no portfolio rows; it does **not** mean available capacity.
3. For WF-03, use a distinct **Chatwoot production DB role with SELECT access only to specific evidence tables**; never connect to Chatwoot as database superuser or attempt migrations. Requires confirmation that `campaign_recipients` exists in deployed edition. Do not configure this workflow if database access is undesirable.
4. After the private schema and its PostgreSQL read credential are available, import **WF-06** to inspect all three systems with one manual execution. It always returns `mode:DRY_RUN`, `decision:HOLD`, and `canSend:false`. This is the practical replacement for editing IDs or running separate scans to infer readiness.
5. Do **not activate schedules until each workflow's manual run has been verified**. Six-hour schedules are optional; no automatic sends, labels, new contacts, template launches or EspoCRM writes occur.
6. An n8n CLI JSON import test tests shape only; the installed community node execution, permissions, provider API responses and database access still require your **real n8n run**. Do not paste credentials/phone numbers into GitHub or ChatGPT logs.

## Critical business policies embedded or held safely

- **26-hour global gap:** measured from verified completion of the *previous cycle's last batch*; Chatwoot's campaign `completed` means processing ended, not that every Meta recipient receipt is settled.
- **Portfolio-wide moving 24-hour messaging tier:** separate from AGE local-day *delivered goal*, attempt/spend caps and recipient-level marketing limits. Unknown manual or external usage = BLOCKED, not 0.
- **Immutable batch labels:** v4.19 Chatwoot reslices contacts in 100-item cursor batches using their current labels. Snapshot recipients before creating a native campaign; never change an in-process label. **Cohort builder/Chatwoot write not yet enabled**.
- **Error 131050:** explicit marketing opt-out; never auto-retry on a six-month schedule.
- **Error 131049:** preserve the *installed extension* rule of +8 / +18 / +28 days after the preceding failure (earliest D0+8/+26/+54) until user revisits it.
- **Error 131026:** ambiguous failure, not proof WhatsApp unregistered.
- **BSUID and phone identities:** reserve/dedupe via independently verified opaque identity key with identity type; never infer BSUID/phone equality from names.
- **Message event provenance:** don't manufacture `providerMessageId` or event timestamp from a polling clock, and don't mark whole Chatwoot batch as submitted merely because campaign CREATE returned 200.

## What remains before a LIVE sender can be safely published

**Not included as working production workflows**: provider-account-health/tier acquisition, fresh CRM audience eligibility and consent snapshot, atomic Postgres reservation function with verified authenticated inputs, Chatwoot contacts/label creation and unique one-off campaign POST, provider message ID/attempt linking, precise late-status reconciliation to AGE `/AGECampaign/event`, Meta rolling external-use ledger, idempotent handling of campaign POST timeouts, and an explicitly approved opted-in pilot.

The legacy architecture shells `age-multi-campaign-cycle-controller.json` and `age-chatwoot-campaign-reconciliation.json` remain **intentionally inert**. Never assume those two are production-ready merely because the new diagnostic and database package passes tests.

## Verifications

GitHub Actions performs:
- Node syntax + Code-node scenario tests for the 6 new workflow JSONs
- Real disposable **n8n 2.37.9 CLI import** of all repository workflows (does not execute provider nodes)
- Real disposable **PostgreSQL 16** migration twice and denial tests for default flags, external-usage freshness, 26h inter-cycle hold and false live gate
- Historic regression tests for 131049, fair multi-campaign allocation, evidence mapping and safe reporting

Results are recorded in `reports/TEST_LOG.md`. **No sending occurred.**

## Sources

See `docs/PLATFORM_RESEARCH_2026-10-23.md`, which references current official Meta, Chatwoot, n8n and EspoCRM docs, plus the v4.19.0 service source.
