# Chatwoot analytics investigation

On 2026-10-24, the operator confirmed recipient-level campaign records in the Chatwoot PostgreSQL database. The analytics HTTP endpoint returned 401. A **replacement AGE 07** read-only PostgreSQL workflow is now committed and validated by automated tests, but **it is inactive, has no credentials and is not live-deployed**. Before production use, verify licensing, least-privilege credentials and AGE-to-Chatwoot mapping.

## Confirmed database observations (operator-provided, read-only)

- Chatwoot PostgreSQL database: `chatwoot`; `public.campaign_recipients` exists.
- Account 2, Chatwoot campaign display ID 2, `AGE Intro Maharastra`: audience 910; queued 0; skipped 0; sent-only 3; delivered-inclusive-of-Read 660; read 505; failed 247.
- Exactly 910 records had a populated `source_id` matching `wamid.%`; 660 had `delivered_at`, 505 `read_at`, 247 `failed_at`, and 247 `error_code`.
- Maximum observed recipient `updated_at`: `2026-10-09 16:02:32.222672` (DB session timezone unknown).
- Another Chatwoot campaign, display ID 1, had zero recipient records. That does not establish that it had no intended audience.
- Per-recipient contact name and mobile were retrieved by joining `campaign_recipients.contact_id` to `contacts.id`. Error codes 131026 and 131049 were observed. No real customer names, numbers, or message IDs are stored in this public repository.

## Verified status field

| Numeric status | Meaning |
| ---: | --- |
| 0 | Queued |
| 1 | Skipped |
| 2 | Sent (not proof of delivery) |
| 3 | Delivered |
| 4 | Read (also counts once as Delivered) |
| 5 | Failed |

Delivered-inclusive-of-Read = distinct recipient rows with status 3 or 4. For this observation, 660 delivered includes 505 read. Do not calculate 660 + 505. Error 131026 does not prove non-registration.

## Key fields for future implementation

| Source field | Meaning / precaution |
| --- | --- |
| `campaigns.id` | Internal Chatwoot campaign primary key; use in joins |
| `campaigns.account_id` | Tenant boundary; filter consistently |
| `campaigns.display_id` | UI/API campaign ID, not internal ID or EspoCRM ID |
| `campaigns.title` | Display title; do not use as reconciliation key |
| `campaign_recipients.id` | Internal recipient row ID, not an AGE attempt ID |
| `campaign_recipients.campaign_id` | Internal foreign key to `campaigns.id` |
| `campaign_recipients.account_id` | Must agree with campaign account |
| `campaign_recipients.contact_id` | Foreign key to current Chatwoot contact |
| `campaign_recipients.inbox_id` | Chatwoot inbox reference |
| `campaign_recipients.contact_inbox_id` | Optional contact-inbox reference |
| `contacts.name` | Current mutable contact name |
| `contacts.phone_number` | Current mutable phone; may differ from sent-to number |
| `campaign_recipients.source_id` | Provider message identifier, observed matching Meta format |
| `campaign_recipients.status` | Current status enum, not event history |
| `campaign_recipients.sent_at` | Recorded send time |
| `campaign_recipients.delivered_at` | Recorded delivery time |
| `campaign_recipients.read_at` | Recorded Read time |
| `campaign_recipients.failed_at` | Recorded failure time |
| `campaign_recipients.error_code` | Preserve original error code |
| `campaign_recipients.error_title` | Provider error title, where populated |
| `campaign_recipients.error_message` | Provider failure explanation, where populated |
| `campaign_recipients.message_content` | Sensitive content; unnecessary for basic metrics |
| `campaign_recipients.created_at` | Database creation timestamp |
| `campaign_recipients.updated_at` | Candidate incremental sync timestamp; not provider event timestamp |

Chatwoot v4.19's schema has a unique index on campaign ID plus contact ID: this is a current recipient snapshot, not a complete record of all retry attempts. Use independent AGE attempt identifiers and verified provider IDs. Preserve source timestamps where available; do not invent them.

## Integration plan and safeguards

The original AGE 07 diagnostic called the Enterprise analytics endpoint and encountered 401. A replacement AGE 07 read-only PostgreSQL workflow has since been committed with automated test coverage, but is **inactive and not live-deployed**. The unified health monitor can continue independently. This documentation update does not modify any workflow JSON, enable sends, or update EspoCRM.

The replacement workflow must be connected only through an authorized read-only PostgreSQL source using a dedicated SELECT-only role, private Coolify networking, pagination, incremental checkpoints, overlap and idempotent replay. Verify Chatwoot-to-EspoCRM campaign/recipient/attempt mappings, raw Meta identity, data freshness, and license entitlement before use. Reading an Enterprise-associated table does not by itself establish authorization to use a paid feature. Compact metrics/checkpoints can go into n8n Data Tables; recipient-level history belongs in appropriately restricted records.

Relevant upstream references: `chatwoot/chatwoot` v4.19.0 `db/schema.rb`, `enterprise/app/models/campaign_recipient.rb`, and `enterprise/app/controllers/api/v1/accounts/campaigns/analytics_controller.rb`.

## PostgreSQL analytics role — grants observed 24 October 2026

Role: `age_chatwoot_analytics_ro` in the `chatwoot` PostgreSQL database.

The operator previously created this login role and granted `CONNECT` on database `chatwoot`, `USAGE` on schema `public`, and `SELECT` on tables `public.campaigns`, `public.campaign_recipients`, and `public.contacts`. A `has_table_privilege` check returned `can_read=t` and `can_update=f` for all three tables.

**New confirmed grant:** The operator ran the following at the PostgreSQL prompt and received `GRANT` (success):

```sql
GRANT SELECT ON TABLE public.inboxes
TO age_chatwoot_analytics_ro;
```

This grants **table-level read access** to inbox metadata so the revised AGE 07 SQL can join/filter inbox data. It does not grant `INSERT`, `UPDATE`, `DELETE`, or access to every Chatwoot table. The success response confirms the grant executed; a direct `has_table_privilege` read/write check for `inboxes` has **not yet been reported**.

Optional SELECT-only verification, which should return `t, f, f, f` for this role:

```sql
SELECT
  has_table_privilege('age_chatwoot_analytics_ro', 'public.inboxes', 'SELECT') AS can_select,
  has_table_privilege('age_chatwoot_analytics_ro', 'public.inboxes', 'INSERT') AS can_insert,
  has_table_privilege('age_chatwoot_analytics_ro', 'public.inboxes', 'UPDATE') AS can_update,
  has_table_privilege('age_chatwoot_analytics_ro', 'public.inboxes', 'DELETE') AS can_delete;
```

Safeguards: Keep the role's password only in secure n8n credentials, never GitHub; use a private network. PostgreSQL roles/grants normally survive routine Chatwoot or Coolify upgrades that retain the database cluster, but a full rebuild or database-only restore may need roles restored separately. Existing grants do not automatically apply to new future tables. Continue checking relevant licensing terms before production access to Enterprise-related analytics data.

## Current implementation files (updated 24 October)

- [AGE 07 Postgres read-only workflow](../workflows/age-07-delivery-read-analytics-native.json): replaces the feature-gated analytics API call, computes delivered-inclusive-Read and failure-code aggregates without personal contact data. Account 2 filter is explicit. Requires a SELECT-only n8n PostgreSQL credential with `campaigns`, `campaign_recipients`, and `inboxes` table access.
- [AGE 07 unit fixtures](../tests/native-delivery-analytics.test.js) and [Postgres SQL fixture](../tests/chatwoot-postgres-analytics-sql.test.js). GitHub Actions covers import compatibility, JavaScript and actual SQL against synthetic PostgreSQL data; it does not connect to the live Chatwoot database.
- [Current import checklist](SIMPLIFIED_THREE_WORKFLOW_DEPLOYMENT.md). Do not enable AGE 07's six-hour schedule until authorized manual comparison confirms expected counts and source behavior; Data Table/EspoCRM persistence remains separate future work.
