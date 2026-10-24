# Chatwoot → n8n PostgreSQL private networking / rollout log

**LATEST VERIFIED MILESTONE — 24 Oct 2026:** A screenshot from n8n shows the credential named **Chatwoot Postgres** and the green message **Connection tested successfully** for `postgres-au4akmkdy3bkd76n7m0ay0ky` / `chatwoot` / `age_chatwoot_analytics_ro`. This supersedes the earlier EAI_AGAIN incident. The exact network-connect commands and worker reachability have not been independently observed, and the next milestones are **read permission validation, inactive AGE 07 manual execution, and persistent Coolify networking**. Do not claim production reconciliation is already active.


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
| First live AGE 07 read | **Not verified yet** | OPEN |

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
| PENDING | PostgreSQL role read-only grant verification | NOT YET VERIFIED |
| 2026-10-24 | n8n credential 'Chatwoot Postgres' using read-only username | VERIFIED via screenshot: **Connection tested successfully**; screenshot does not prove SELECT permissions or workflow execution |
| PENDING | Approved durable Coolify network configuration | NOT YET VERIFIED |
| PENDING | AGE 07 live manual read-only results | NOT YET VERIFIED |

## References

- [Coolify Service Networking](https://coolify.io/docs/services/configuration/networking)
- [Coolify Service Compose](https://coolify.io/docs/services/configuration/docker-compose)
- [Coolify Networking and Docker](https://coolify.io/docs/core/networking-in-coolify)
- [AGE 07 deployment checklist](SIMPLIFIED_THREE_WORKFLOW_DEPLOYMENT.md)
- [Verified Chatwoot field semantics](CHATWOOT_ANALYTICS_DISCOVERY_2026-10-24.md)
