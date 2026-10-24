# Chatwoot → n8n PostgreSQL private networking / rollout log

## URGENT incident — 24 October 2026, approximately 19:22 IST (OPEN)

**Operator screenshot after changing Coolify Service → General → Network attachment to "Connect to the predefined Coolify network":** Coolify overall service shows **Degraded**; Chatwoot, PostgreSQL and Redis show **Running (healthy)**; **Sidekiq shows "Restarting (unknown)"**. The operator's browser also contains a "Site not available" tab, but whether that domain is specifically Chatwoot and the exact error are not independently verified. **This may represent a production background-worker outage. Prioritize recovery over AGE 07 expansion.** The changed network setting and restart happened close together, but **causality has not yet been proven**.

### New diagnostic evidence: 24 Oct 2026, 13:54:47 as printed in logs (incident still OPEN)

The operator provided a Sidekiq/Ruby stack trace ending in `sidekiq-7.3.10/lib/sidekiq/cli.rb:305`, `rails-7.2.3.1` initializers and `/app/config/environment.rb:5`. This **proves Sidekiq aborts during Rails initialization**, but the *exception class and message*, usually above the stack trace, were **not present in the excerpt**. There is **not enough evidence to attribute the failure to Redis, PostgreSQL, DNS, or the newly shared network yet**.

From VPS SSH host only, gather the preceding exception and current state without mutation:

```bash
docker inspect sidekiq-au4akmkdy3bkd76n7m0ay0ky \
  --format 'State={{.State.Status}} Exit={{.State.ExitCode}} Restarts={{.RestartCount}} Error={{.State.Error}}'
docker logs --tail 300 --timestamps sidekiq-au4akmkdy3bkd76n7m0ay0ky 2>&1 \
  | grep -E -B 12 -A 16 -m 3 '([A-Za-z]+Error|PG::|Redis::|FATAL|Name or service not known|Temporary failure in name resolution|Connection refused|Caused by|Error connecting)'
```

If `grep` finds nothing, inspect the **beginning** of a complete recent crash in `docker logs --tail 200 --timestamps ...`, not only the last Ruby frames. Remove tokens/customer data from output.

Do not retry upgrades, clear queues, run migrations or expose database ports. Keep **AGE 07 and additional n8n workflow development paused** during the incident. If logs show a startup connection problem clearly caused by the network change, a supervised rollback of Coolify's network attachment to **Use the stack network only**, preserving all persistent volumes, is the preferred reversible mitigation; verify web, Sidekiq, DB and Redis health afterward.

**Immediate safe incident triage from VPS host (no container changes):**

```sh
docker ps -a --filter name=au4akmkdy3bkd76n7m0ay0ky --format 'table {{.Names}}\t{{.Status}}\t{{.Networks}}'
docker inspect sidekiq-au4akmkdy3bkd76n7m0ay0ky --format 'Status={{.State.Status}} ExitCode={{.State.ExitCode}} RestartCount={{.RestartCount}} Error={{.State.Error}}'
docker logs --tail 100 --timestamps sidekiq-au4akmkdy3bkd76n7m0ay0ky
docker logs --tail 60 --timestamps chatwoot-au4akmkdy3bkd76n7m0ay0ky
docker logs --tail 60 --timestamps coolify-proxy
```

Do not publish secrets or full environment variables if accidentally logged. Look for first Sidekiq failure (Redis/DNS/auth, PostgreSQL/DNS/auth, process error or changed Compose). Check if the Chatwoot public URL works separately from the worker; a healthy Chatwoot web container and failed worker can coexist, while a public "No available server" error points to Traefik routing/health/domain issues. [Coolify troubleshooting](https://coolify.io/docs/services/operations/troubleshooting) says to collect logs and check the *first* error rather than restarting repeatedly.

**Conditional rollback when justified:** If failure began with the network change and logs do not reveal an unrelated cause, prefer reverting the **saved Network attachment** setting to **Use the stack network only** and using **Restart current version** (no image pulls) during supervised incident recovery. Preserve the Chatwoot PostgreSQL named volumes and existing Compose environment; do **not** delete/replace database, remove volumes or change images. This rollback may temporarily remove n8n's Chatwoot DB connection; that is acceptable because production Chatwoot availability is higher priority. If the original stack setting already restores service health without a restart, do not provoke another interruption. Document actual remedy and post-recovery Sidekiq/Chatwoot/Redis/PG health, public domain and n8n connection state.

**Not yet verified:** Sidekiq log cause, public-site error, saved-Compose changes, and recovery. This note must not be marked resolved until the operator supplies evidence.


**LATEST VERIFIED MILESTONE — 24 Oct 2026:** A successful manual AGE 07 workflow execution is confirmed; campaign 2 is `SNAPSHOT_VALID` and the overall `PARTIAL` reflects empty campaign 1. See the live first-run acceptance record below. Private connectivity currently works, but persistence across a Coolify redeploy and explicit denial of DB write permissions remain unverified.


**Created 24 October 2026; updated after successful n8n credential connection.** This is a living, **evidence-based** operational record for the AGE environment. Do not store passwords, token values, URLs with credentials, customer phone numbers, IP addresses, or environment-variable dumps in this public repository.

## Observed facts (confirmed by operator)

| Item | Evidence / value | Status |
| --- | --- | --- |
| Host / platform | Single VPS managed by Coolify 4.5.0 | Confirmed via VPS `docker ps` |
| Chatwoot | `chatwoot-au4akmkdy3bkd76n7m0ay0ky`, image `chatwoot/chatwoot:v4.19.0` | Running at last operator check |
| Chatwoot PostgreSQL | `postgres-au4akmkdy3bkd76n7m0ay0ky`, image `pgvector/pgvector:pg16`, DB `chatwoot` | Running at last operator check |
| Chatwoot resource network | `au4akmkdy3bkd76n7m0ay0ky` | Chatwoot PostgreSQL connected |
| n8n main | `n8n-l11w6qi16cakcn9f855wbbk1`, image `n8nio/n8n:2.44.6` | On `coolify` and `l11w6qi16cakcn9f855wbbk1` |
| n8n worker | `n8n-worker-l11w6qi16cakcn9f855wbbk1`, image `n8nio/n8n:2.44.6` | On `coolify` and `l11w6qi16cakcn9f855wbbk1` |
| Target credential | `age_chatwoot_analytics_ro`, database `chatwoot`, port `5432` | Created/other grants indicated in conversation; **full grants still require verification** |
| Additional grant | `GRANT SELECT ON TABLE public.inboxes TO age_chatwoot_analytics_ro;` returned `GRANT` | **Confirmed applied** by operator |
| n8n credential UI | `getaddrinfo EAI_AGAIN postgres-au4akmkdy3bkd76n7m0ay0ky` | **Confirmed failure** (DNS/network reachability before authentication) |
| AGE 07 source | SELECT-only PostgreSQL summary JSON in GitHub | Committed and CI synthetic-tested; **not connected/deployed live** |
| Internet exposure | No reason to open PostgreSQL port to public internet | Do not publish 5432 |
| Permanent Coolify networking | **Not configured/verified yet** | OPEN |
| n8n credential test | **SUCCESS: 'Connection tested successfully'** on 2026-10-24; screenshot shows 'Chatwoot Postgres' with `age_chatwoot_analytics_ro`, DB `chatwoot`, internal host | VERIFIED (DNS/TCP/auth); no SQL permission proof |
| AGE 07 first live manual read | **SUCCESS** at `2026-10-24T13:33:38.813Z`; DB returned two matching campaigns; account 2/display ID 2 = `SNAPSHOT_VALID`; display ID 1 = `PARTIAL` solely because no recipient rows | VERIFIED LIVE; no sends or writes |

**Diagnosis:** The two services are isolated on separate Docker networks. The n8n main and worker were on `coolify` and their resource network, while Chatwoot PostgreSQL was only on its Chatwoot resource network. Docker DNS typically resolves these internal names only across shared user-defined networks. `EAI_AGAIN` is a DNS failure; it is **not** evidence that the password is incorrect.

## Stage 1 — non-disruptive private connectivity pilot (temporary)

At the **VPS host shell** (prompt like `root@...:~#`, **not** `chatwoot=#` or a container's `#` terminal), attach *only* n8n main and worker to Chatwoot's existing network. This is less broad than attaching Chatwoot PostgreSQL to the shared `coolify` network for the initial test.

```sh
docker network connect au4akmkdy3bkd76n7m0ay0ky n8n-l11w6qi16cakcn9f855wbbk1
docker network connect au4akmkdy3bkd76n7m0ay0ky n8n-worker-l11w6qi16cakcn9f855wbbk1
```

If either command says `already exists`, verify actual membership before continuing. The commands attach running containers without intentional restart, but **do not persist across Coolify container re-creation**.

Check that both n8n containers can reach the Chatwoot PostgreSQL private port **without credentials**:

```sh
for C in n8n-l11w6qi16cakcn9f855wbbk1 n8n-worker-l11w6qi16cakcn9f855wbbk1; do
  echo "Testing $C"
  docker exec "$C" node -e '
    const net = require("net");
    const host = "postgres-au4akmkdy3bkd76n7m0ay0ky";
    const s = net.connect({host, port:5432});
    s.setTimeout(5000);
    s.on("connect", () => { console.log("OK: TCP 5432 reachable"); s.end(); });
    s.on("error", e => { console.log("ERROR:", e.code); process.exitCode=1; });
    s.on("timeout", () => { console.log("ERROR: TIMEOUT"); s.destroy(); process.exitCode=1; });
  '
done
```

Passing this test proves **DNS/TCP reachability only**, not that the database login, privileges or SQL query work. The initial `EAI_AGAIN` should then disappear.

## Stage 2 — verify minimum PostgreSQL permissions, privately

Run this **in the authorized Chatwoot PostgreSQL `psql` console**. It returns booleans, no customer data and no password:

```sql
SELECT
  rolname, rolcanlogin,
  has_database_privilege(rolname,'chatwoot','CONNECT') AS db_connect,
  has_schema_privilege(rolname,'public','USAGE') AS public_usage,
  has_table_privilege(rolname,'public.campaigns','SELECT') AS campaigns_select,
  has_table_privilege(rolname,'public.campaign_recipients','SELECT') AS recipients_select,
  has_table_privilege(rolname,'public.inboxes','SELECT') AS inboxes_select,
  has_table_privilege(rolname,'public.campaign_recipients','INSERT') AS recipients_insert,
  has_table_privilege(rolname,'public.campaign_recipients','UPDATE') AS recipients_update,
  has_table_privilege(rolname,'public.campaign_recipients','DELETE') AS recipients_delete
FROM pg_roles WHERE rolname='age_chatwoot_analytics_ro';
```

Expect one row: login, connect, usage and all three SELECT privileges true; all three write privileges false. No need for `contacts` SELECT for **current** AGE 07 aggregate query.

## Stage 3 — n8n credential (manual, secret stays in n8n)

In n8n: **Credentials → New → Postgres**. Bind:

| Key | Value |
| --- | --- |
| Host | `postgres-au4akmkdy3bkd76n7m0ay0ky` |
| Database | `chatwoot` |
| Port | `5432` |
| User | `age_chatwoot_analytics_ro` |
| Password | existing private password — never paste into GitHub/chat |
| SSL | choose according to actual internal PostgreSQL server TLS configuration; do not bypass verification for a TLS-required endpoint |

Test. An `EAI_AGAIN` is name resolution; `ECONNREFUSED` or timeout means TCP; `28P01` means authentication; `42501` means missing privileges. Keep these failure classes distinct.

**Security/licensing gate:** Separately confirm applicable Chatwoot entitlement for the Enterprise-associated data source before using it in production. Having table access does not confer paid-feature rights.

## Stage 4 — approved, durable configuration through Coolify

**Do not confuse Stage 1's manual network attach with a durable setup.** On the normal/default Coolify destination, a Service stack can be configured to **Connect To Predefined Network** to join `coolify` in addition to its resource network. The n8n main and worker already have `coolify`. Chatwoot's stack currently does not.

A simple durable option, **after a verified backup and approved maintenance window**, is to open the Chatwoot Service **Configuration → General → Connect To Predefined Network** (verify the selected destination is `coolify`); save, review **Show Deployable Compose** to check its generated networks, then redeploy. **This likely recreates/restarts the Chatwoot stack; it is not a zero-downtime step.** It also puts *all selected Chatwoot Service components*, including PostgreSQL, on the shared `coolify` network, expanding which containers can attempt a connection to the DB. Retain a least-privilege DB role and avoid public exposure.

If stricter isolation is preferred, use a dedicated private Docker network declared in appropriately persistent Coolify Compose configuration for only PostgreSQL and n8n workers/main. Review/backup both current Service definitions, avoid unreviewed edits to Coolify-generated Compose and confirm update survival after redeploy. Do **not** assume a manual `docker network connect` is durable. Because the actual Compose definitions have not been inspected, a tailored permanent change is **pending** rather than committed or applied.

After a durable change: verify Chatwoot and n8n remain healthy, check membership of both containers on a common network, repeat DNS/TCP and n8n credential tests, and test again after a controlled redeploy. **No need to expose `5432` to the public internet.**

If the temporary trial must be rolled back without affecting existing networks:

```sh
docker network disconnect au4akmkdy3bkd76n7m0ay0ky n8n-l11w6qi16cakcn9f855wbbk1
docker network disconnect au4akmkdy3bkd76n7m0ay0ky n8n-worker-l11w6qi16cakcn9f855wbbk1
```

Only run rollback if these were the attachments actually added; do not disconnect a network now managed by the durable Coolify Compose configuration.

## Stage 5 — inactive AGE 07 read-only pilot and acceptance

1. Import [AGE 07](../workflows/age-07-delivery-read-analytics-native.json) from GitHub into n8n **inactive** and configure the Postgres node with this credential. Disable any old AGE 07 import to avoid duplicate scheduled runs.
2. Execute **manually** only after the access/license gate has been reviewed. Look for account 2, display campaign ID 2 and verify against an independently checked contemporaneous snapshot. Earlier observation: **910 audience, 3 sent-only, 660 delivered including 505 Read, 247 failed, 910 candidate provider IDs, 247 error codes**; metrics may evolve.
3. A valid output contains `source=CHATWOOT_POSTGRES_CAMPAIGN_RECIPIENT_SNAPSHOT`, `sends=0`, `crmEventWrites=0`, `dataTableWrites=0`, and **no customer phones or message contents**. Diagnose `PARTIAL` and `BLOCKED` honestly.
4. This workflow **does not yet** persist compact Data Table summaries or individual EspoCRM delivery outcomes. Those are separate future release gates with trusted attempt mapping and idempotent writes.

## Live first-run acceptance record — 24 October 2026 (verified)

**Evidence:** Operator supplied the input SQL-node JSON output and output of the Code-node validator from their real n8n instance (n8n 2.44.6), plus a screenshot of its green executed output. Execution timestamp from JSON: `2026-10-24T13:33:38.813Z` (19:03:38 IST). **This is the first successful live execution of AGE 07**, not merely an import test.

| Output field | Account 2 / Chatwoot display campaign ID 2 |
| --- | --- |
| Chatwoot internal campaign ID | 2 |
| Campaign / inbox | `AGE Intro Maharastra` / inbox 5 |
| Audience | 910 |
| Queued / Skipped / Sent-only | 0 / 0 / 3 |
| Delivered-only | 155 |
| Read confirmed | 505 |
| Delivered inclusive of Read | **660 (155 + 505)** |
| Failed | 247 |
| Provider IDs present / Meta `wamid.` format | 910 / 910 |
| Delivered / Read / failure timestamps present | 660 / 505 / 247 |
| Failures with error codes | 247 |
| Error codes | `130472: 10`, `131026: 134`, `131049: 103` |
| Read share of confirmed delivery | 76.52% |
| `lastRecipientUpdate` | `2026-10-09T10:32:32.222Z` (UTC) |
| Per-campaign validation | **`SNAPSHOT_VALID`** with `reasons: []` |

The second matched WhatsApp one-off campaign is display ID 1, `AGE WhatsApp Campaign Test 01`: **0 rows**, `PARTIAL` with `NO_RECIPIENT_EVIDENCE`. Thus **overall status `PARTIAL` is correct and expected**, even though campaign 2 is valid. The full scan contained two campaigns, `scanComplete:true`, well below the 201 row/campaign safety limit; the `PARTIAL` response does not indicate SQL failure.

The workflow reported `sends:0`, `crmEventWrites:0`, `dataTableWrites:0`, `mapping:'UNMATCHED'`, `canWriteEspoEvents:false`, `licensePermissionVerified:false`, and `completeHistoricalEventLog:false`. No credentials, actual message IDs, recipient names or phone numbers were published. Counts match independent prior PostgreSQL inspection. The Postgres client showed `last_recipient_update` in UTC, consistent with an earlier IST-style database rendering shifted by 5 h 30 min; the earlier terminal session timezone was not separately checked.

**This test verifies SQL SELECT privileges on the required three tables, actual n8n SQL execution, input-to-validator flow, and counts.** It does **not** prove the PostgreSQL role lacks INSERT/UPDATE/DELETE, that the network attachment survives Coolify redeploy, that provider IDs correspond to the correct EspoCRM attempts, or that use of Enterprise-associated data is licensed.

### Remaining actionable deployment gates

1. **Network durability:** Stage 1 container attachment was sufficient for successful execution, but the exact commands and topology after restart are not yet independently verified. Do not restart services solely to test this until a durable networking change is configured and backups verified.
2. **Least-privilege audit:** Run the non-sensitive `pg_roles`/has_table_privilege query from Stage 2 and ensure DML privilege checks are false. Never send the database password.
3. **Permanent Coolify networking:** In Coolify find the existing Chatwoot **Service → Configuration → General → Connect To Predefined Network**, where destination is the `coolify` network used by n8n. **This joins the Chatwoot Service components, including PostgreSQL, to the shared internal `coolify` network**, exposing them to other containers on that network (though not to the public internet). Review resulting **Show Deployable Compose**, persistent database volumes, backups, and schedule a supervised restart/deployment; verify availability after the change. **Do not enable public Postgres port or replace existing Compose definition unreviewed.**
4. **After persistent change:** Repeat credential check and manual AGE 07 execution. Confirm output still matches a fresh database snapshot; verify both n8n main and worker connectivity. Only then consider the six-hour schedule, assuming access/licensing approval.
5. **Business functionality still absent:** Data Table persistence, exact recipient/attempt mapping, and idempotent EspoCRM updates have not been developed/authorized in the current AGE 07. Do not claim full WhatsApp-to-EspoCRM reconciliation.

## Coolify 4.5.0 General-screen confirmation — 2026-10-24

Operator screenshot confirms the live Chatwoot **Service → General → Network → Network attachment** dropdown currently displays **`Use the stack network only`**. The same screen shows Chatwoot, Sidekiq, PostgreSQL and Redis as healthy. This identifies the exact *persisted resource configuration* responsible for the current isolation, even though the temporary Docker attachment already allowed a successful AGE 07 manual run.

Verified from current Coolify documentation and implementation: the alternative entry is **`Connect to the predefined Coolify network`**. Selecting it changes the saved service definition; the network change is realized when Coolify recreates/redeploys the stack. The original per-service stack network remains attached. The default predefined destination network is **`coolify`**, currently shared with n8n. Check the selected deployment destination and the generated Compose before restarting.

**Security tradeoff:** This built-in option is easy to maintain and normally survives subsequent Coolify-controlled redeploys, but it adds **the entire Chatwoot stack including PostgreSQL** to the shared `coolify` network. Other containers on that network gain network-level reachability; PostgreSQL password, least-privilege grants, and not publishing port 5432 remain essential. If strict isolation is needed, review dedicated Compose network design instead of using the shared destination network. Do not modify running production services without a tested restorable database backup.

**Recommended controlled change (not yet performed):** verify the Postgres persistent storage and a restorable backup (Coolify `Persistent Storage` and `Backups`), then change the dropdown to **Connect to the predefined Coolify network**, review **Show Deployable Compose**, and after an approved maintenance window use **Restart current version** (not `Pull Latest`). Confirm healthy components, shared network membership, n8n main and worker DNS connectivity, credential connection, and rerun the read-only AGE 07 comparison. Only then consider the temporary manual network attachments superseded.

**Status: PENDING operator selection, backup verification, controlled redeploy, and post-redeploy acceptance.** Seeing the dropdown alone does not mean persistence has been configured.

## Operator log — update with evidence, not assumptions

| Date | Action | Result |
| --- | --- | --- |
| 2026-10-24 | PostgreSQL query and populated recipient fields confirmed | VERIFIED (910-row example) |
| 2026-10-24 | `GRANT SELECT ... public.inboxes` | VERIFIED (`GRANT`) |
| 2026-10-24 | n8n PostgreSQL credential attempted with internal Chatwoot host | BLOCKED (`getaddrinfo EAI_AGAIN`) |
| 2026-10-24 | Host `docker ps` network membership inspected | VERIFIED (two isolated resource networks) |
| 2026-10-24 | GitHub runbook authored; source and CI tests previously passed | DOCUMENTED; not live-deployed |
| 2026-10-24 | n8n main-container private DNS/TCP/database login | **VERIFIED indirectly** by successful n8n credential test; command output and worker attachment not independently seen |
| PENDING | Verify worker network membership and TCP | NOT YET VERIFIED |
| 2026-10-24 | PostgreSQL SELECT permission validation | **Verified functionally:** live AGE 07 query successfully SELECTed `campaigns`, `campaign_recipients`, and `inboxes` as credential `age_chatwoot_analytics_ro`; explicit write-permission denial test still pending |
| 2026-10-24 | n8n credential 'Chatwoot Postgres' using read-only username | VERIFIED via screenshot: **Connection tested successfully**; screenshot does not prove SELECT permissions or workflow execution |
| 2026-10-24 | Chatwoot Coolify 4.5.0 network attachment inspected | VERIFIED screenshot: currently `Use the stack network only`; alternative `Connect to the predefined Coolify network` identified but **not yet selected** |
| PENDING | Approved durable Coolify network configuration | NOT YET VERIFIED |
| 2026-10-24 | AGE 07 live manual execution | VERIFIED: campaign 2 `SNAPSHOT_VALID`, all 910 rows reconcile and 247 failure codes sum; campaign 1 has no rows, causing **expected overall `PARTIAL`**, not a query failure |

## References

- [Coolify Service Networking](https://coolify.io/docs/services/configuration/networking)
- [Coolify Service Compose](https://coolify.io/docs/services/configuration/docker-compose)
- [Coolify Networking and Docker](https://coolify.io/docs/core/networking-in-coolify)
- [AGE 07 deployment checklist](SIMPLIFIED_THREE_WORKFLOW_DEPLOYMENT.md)
- [Verified Chatwoot field semantics](CHATWOOT_ANALYTICS_DISCOVERY_2026-10-24.md)
