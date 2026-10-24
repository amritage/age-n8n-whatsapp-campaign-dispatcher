# Current n8n import guide — 2 monitors + optional setup

> **Development exception (24 Oct):** The former AGE 03 advanced SQL file has been **reused** as [AGE 03 manual recipient-evidence inspector](../workflows/age-03-chatwoot-evidence-readonly.json). It is **not a production third/fourth scheduled workflow**: inactive, manual-only, private recipient data, read-only, and no EspoCRM/Data Table writes. See [AGE 03 paging and mapping guide](RECIPIENT_EVIDENCE_PAGING_AND_MATCHING_2026-10-24.md). AGE 07 still owns aggregate reporting. Do not enable AGE 03 on any schedule.


**Updated 24 October 2026** · Installed n8n now observed at 2.44.6 queue mode · Chatwoot v4.19.0 · EspoCRM.  
**This replaces the older 3-workflow / 7-workflow recommendations.** The current authority is [the 22-workflow inventory](../workflows/README.md). No existing deployed n8n workflows are changed by GitHub edits.

> **Live pilot outcome — 24 Oct 2026:** AGE 07 has **already passed a real manual execution** in n8n 2.44.6. Display campaign 2 is `SNAPSHOT_VALID` with 910 audience / 660 delivered (505 read) / 247 failed. A separate zero-row test campaign correctly makes the **overall** status `PARTIAL`. `scanComplete=true`; SQL and credentials are working. **Do not repeatedly import duplicate workflow copies.** The remaining steps are the DB write-privilege audit, durable private network configuration, licensing review, and any separately approved scheduled operation or data storage. Full evidence: [operator log](CHATWOOT_N8N_PRIVATE_NETWORK_RUNBOOK_2026-10-24.md).


## Exactly what to import

| Order | File | How to operate |
|---|---|---|
| Optional one-time setup | [Data Tables setup](../workflows/age-dt-setup-managed-tables.json) | Only use when `AGE_Portfolio_Control` and `AGE_Dispatcher_Events` do not exist and weren't created from [CSV samples](../examples/n8n-data-tables/README.md). Run manually once. |
| 1 | [Unified 6-hour health monitor](../workflows/age-unified-six-hour-health-readonly.json) | Import inactive, choose existing EspoCRM/Chatwoot credentials, run manually. It reads managed Data Tables and reports `HOLD` (zero sends). After successful test, enable its optional six-hour schedule. |
| 2 | [AGE 07 PostgreSQL Delivered/Read/Error snapshot](../workflows/age-07-delivery-read-analytics-native.json) | **New source-based replacement, inactive by default.** Review licensing; bind a separate SELECT-only Chatwoot PostgreSQL credential; run manually, verify against campaign 2's documented reference counts. **Do not schedule before credential/entitlement/SQL review.** This is an aggregate snapshot, not an EspoCRM event writer. |

**AGE 08** [provider evidence reducer](../workflows/age-08-verified-message-evidence-reducer.json) is **NOT an active fourth workflow**. It has no verified event collector, no durable cross-run ledger and no authenticated mapping to AGE attempts. It is developer-only.

**Do NOT additionally import for live scheduling** AGE 00 (earlier daily analytics), AGE 01–06 modular variants, earlier recipient reports, old API readiness variants, PostgreSQL-based workflows, or the old sending/reconciliation **design shells**. They all remain in GitHub for history. Their in-JSON names now begin with `[OLD]`, `[LEGACY SQL]`, `[ADVANCED SQL]` or `[DESIGN SHELL]`.

## Expected safety behavior

- Both current workflows are read-only and committed `active:false`.
- Unified health **never launches campaigns** or writes EspoCRM data; it reports only available controls, source health, and recorded events.
- AGE 07 now reads the three Chatwoot tables `campaigns`, `campaign_recipients`, and `inboxes` via SELECT-only SQL scoped to account 2 and native one-off WhatsApp inbox campaigns. **Delivered includes Read** (status 3 or 4), without double-counting.
- The database query summarizes up to **201** campaigns, with per-campaign error-code breakdown and ID/timestamp coverage; at the limit it reports PARTIAL, not complete. Error/permission responses produce BLOCKED, never fabricated zeroes. No mobile numbers or message contents are exported.
- AGE 07 is **currently read-only and does not write to n8n Data Tables or EspoCRM**. Even though the DB contains Meta-format IDs/timestamps, the exact AGE campaign/recipient/attempt mapping and provider provenance are not yet established. Provider event history and idempotent incremental sync remain future work.
- n8n queue-mode Data Tables are fine for compact operational state; their row upserts do **not** constitute guaranteed atomic sending reservations.
- No custom PostgreSQL schema is required; **four** existing Chatwoot tables are NOT read: only `campaigns`, `campaign_recipients`, and `inboxes` are accessed. `contacts` is not queried in the aggregate workflow. Chatwoot source is unchanged. Database access does not itself grant Enterprise license entitlement.

## Manual checklist

1. Verify Data Tables exist with correct column names/types; if created using demo CSVs, delete sample rows but retain the tables.
2. Import only the two **USE NOW** workflow JSON files. Optional setup must run first *only when tables are missing*.
3. For AGE 07, use the **separate Chatwoot PostgreSQL database**, not n8n's app DB: create a dedicated `age_chatwoot_analytics_ro` role. Grant only CONNECT on database `chatwoot`, USAGE on `public`, and SELECT on `public.campaigns`, `public.campaign_recipients`, `public.inboxes`. Never embed DB credentials or expose port 5432 publicly.
4. Verify the Chatwoot edition/license permits this use before executing the data reader in production. Bind the PostgreSQL credential to AGE 07 and run it **manually in an authorized pilot**; expected historic campaign-2 snapshot as verified on 24 Oct: audience 910, delivered-inclusive 660, Read 505, failed 247, sent-only 3. This is a snapshot that may change.
5. Check `status`, `reports[].reasons`, `scanComplete`, `crmEventWrites:0`, `dataTableWrites:0`. Permission/schema errors show BLOCKED; zero recipient rows show PARTIAL; reaching 201 reports PARTIAL.
6. Enable schedules only after the manual tests, database security, entitlement review and operational sign-off; keep earlier imported AGE 07 versions disabled. The unified monitor is independent. Do not enable earlier copies already imported to n8n; GitHub name changes don't update installed workflow titles automatically.
6. Treat read-only testing and import-CI success as separate from a live sender or persistent provider→EspoCRM reconciliation.

See [the source-verified 24-Oct reconciliation handoff](RECONCILIATION_WORKFLOWS_2026-10-24.md) and [Meta status reconciliation acceptance criteria](WHATSAPP_CAMPAIGN_DELIVERY_RECONCILIATION_REQUIREMENTS.md).

> **CURRENT BLOCKER — screenshot verified 24 Oct 2026:** n8n Postgres credential returns `getaddrinfo EAI_AGAIN postgres-au4akmkdy3bkd76n7m0ay0ky` because Chatwoot DB and n8n are on separate Docker networks. Follow the [stage-by-stage private-network rollout log](CHATWOOT_N8N_PRIVATE_NETWORK_RUNBOOK_2026-10-24.md) before credential testing. The `inboxes` SELECT grant was confirmed, but other grants and successful n8n login have not yet been verified.

> **Verified milestone (24 October 2026):** Screenshot shows the n8n credential **Chatwoot Postgres** successfully tested against the private Chatwoot host with database `chatwoot` and login `age_chatwoot_analytics_ro`. The earlier `EAI_AGAIN` condition is resolved for the **credential test**; running workflows on a separate n8n worker, SQL SELECT grants, durable networking after Coolify redeploy, and AGE 07 live SQL output are still unverified. See [operator milestone log](CHATWOOT_N8N_PRIVATE_NETWORK_RUNBOOK_2026-10-24.md).

**Simplest import path (no SSH deployment):** In n8n open the intended project → create a **new workflow** → top-right three-dot workflow menu → **Import from URL** and paste `https://raw.githubusercontent.com/amritage/age-n8n-whatsapp-campaign-dispatcher/main/workflows/age-07-delivery-read-analytics-native.json`. If Import from URL is unavailable, download that JSON from GitHub and use **Import from File**. Keep workflow inactive, select existing **Chatwoot Postgres** credential in its **Chatwoot PostgreSQL - Read Campaign Rollups** node, **Save**, then manually click **Execute Workflow**. Do not enable the schedule before worker connectivity, data comparison and permission/entitlement approval. An imported repository file does not automatically replace a previously deployed instance.

## Coolify → n8n: connection and first-run verification

**Observed 24 October 2026:** n8n main and worker have versions 2.44.6 and belong to both `coolify` and `l11w6qi16cakcn9f855wbbk1` Docker networks. Chatwoot PostgreSQL `postgres-au4akmkdy3bkd76n7m0ay0ky` belongs only to `au4akmkdy3bkd76n7m0ay0ky`. Therefore a private network connection is needed **before** the n8n PostgreSQL credential can work. For a non-disruptive temporary test, attach the **n8n main and worker** containers to the Chatwoot network via Docker's `network connect`, test host lookup/TCP access, and then preserve the desired topology in Coolify's persistent service configuration. Direct network attachments are **lost on container re-creation**; do not regard a successful one-off test as lasting configuration. Prefer minimal network exposure and do not publish PostgreSQL ports.

 (added 24 October)

**After the operator has granted SELECT on `public.inboxes`:** do not assume the new role has the other privileges or that the n8n container can reach Chatwoot PostgreSQL. Check permissions **without returning any customer records** in the existing Coolify PostgreSQL terminal:

```sql
SELECT
  rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
  has_database_privilege(rolname, 'chatwoot', 'CONNECT') AS can_connect,
  has_schema_privilege(rolname, 'public', 'USAGE') AS can_use_public,
  has_table_privilege(rolname, 'public.campaigns', 'SELECT') AS can_read_campaigns,
  has_table_privilege(rolname, 'public.campaign_recipients', 'SELECT') AS can_read_recipients,
  has_table_privilege(rolname, 'public.inboxes', 'SELECT') AS can_read_inboxes,
  has_table_privilege(rolname, 'public.campaign_recipients', 'INSERT') AS can_insert_recipients,
  has_table_privilege(rolname, 'public.campaign_recipients', 'UPDATE') AS can_update_recipients,
  has_table_privilege(rolname, 'public.campaign_recipients', 'DELETE') AS can_delete_recipients
FROM pg_roles WHERE rolname='age_chatwoot_analytics_ro';
```

Expected: exactly one role row, LOGIN and three SELECT permissions true; SUPERUSER/CREATEDB/CREATEROLE, INSERT/UPDATE/DELETE false. **Do not copy role passwords, connection URLs or database owner details into tickets/GitHub.** If missing grants, an authorized DBA can add only the required CONNECT, USAGE and SELECT privileges—not broad `ALL TABLES` access.

**Configure n8n:**

1. In Coolify, locate Chatwoot PostgreSQL **General → Postgres URL (internal)**, and copy only its *internal hostname* (not the owner username/password). Use the database name `chatwoot` and port `5432`, unless Coolify says otherwise.
2. Confirm n8n and Chatwoot PostgreSQL are attached to the **same Docker destination network**. A Coolify Compose/Service installation may require an explicitly approved *Connect To Predefined Network* setting and a redeploy; do not enable public PostgreSQL access. Validate networking before changing a running service.
3. In n8n **Credentials → New → Postgres**, set Host = internal hostname, Database = `chatwoot`, User = `age_chatwoot_analytics_ro`, Password = the secret set privately with `\\password`, Port = 5432. Follow server-specific SSL settings; do not simply ignore certificate failures. Test the credential.
4. Import [AGE 07](../workflows/age-07-delivery-read-analytics-native.json) **as a new, inactive workflow**, bind only this PostgreSQL credential to **Chatwoot PostgreSQL - Read Campaign Rollups**, and ensure previous AGE 07 versions remain disabled. Do not run if required licensing/authorization review is unresolved.
5. Run **Manual Trigger** with the workflow still inactive. For a successful historical snapshot, look for campaign display ID `2`: audience 910, sent-only 3, delivered-inclusive-of-Read 660, Read 505, failed 247, source IDs 910, coded errors 247. These were operator-observed historical values and could have changed; validate against a fresh independent SQL query when needed.
6. Expected top-level: `mode=READ_ONLY`, `source=CHATWOOT_POSTGRES_CAMPAIGN_RECIPIENT_SNAPSHOT`, `crmEventWrites=0`, `dataTableWrites=0`, `sends=0`. Inspect `reports[].reasons`. `BLOCKED` means an error/inconsistency; `PARTIAL` means a coverage gap or scan cap, not successful full coverage.
7. Keep the six-hour schedule inactive until manual test, database security and acceptable license/access terms are all verified. **Do not create a second active AGE 07**. No existing Data Table, EspoCRM or Chatwoot records are changed by this workflow.

**If n8n's Test Credential fails:** first verify the hostname/network. `localhost` refers to the n8n container, **not** Chatwoot PostgreSQL. Distinguish DNS/network errors from PostgreSQL password failure (`28P01`), `pg_hba.conf` access denial, and database/table grants (`42501`). Do not resolve this by opening port 5432 publicly or using Chatwoot's database owner credentials.

Coolify official documentation: [PostgreSQL internal URL](https://coolify.io/docs/databases/postgresql) · [Service networking](https://coolify.io/docs/services/configuration/networking). n8n: [Postgres credentials](https://docs.n8n.io/integrations/builtin/credentials/postgres).

## Important field-level reference

See [2026-10-24 verified Chatwoot database discovery](CHATWOOT_ANALYTICS_DISCOVERY_2026-10-24.md) for statuses, joins, timestamps, 131026/131049 errors and limitations. The workflow performs only an **aggregate read** and preserves the existing 22-file inventory; a later gated implementation must handle contact/attempt-level EspoCRM mapping and Data Table upserts if approved.
