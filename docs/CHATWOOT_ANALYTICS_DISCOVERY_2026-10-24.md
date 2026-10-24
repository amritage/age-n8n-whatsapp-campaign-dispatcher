# Chatwoot analytics investigation

On 2026-10-24, the operator confirmed recipient-level campaign records in the Chatwoot PostgreSQL database. The analytics HTTP endpoint returned 401. Before implementing a production integration, verify data mappings, least-privilege access, and applicable license terms. Existing workflows remain unchanged.

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

The existing AGE 07 diagnostic calls the Enterprise analytics endpoint, which returned 401; its schedule should stay disabled where that access is unavailable. The unified health monitor can continue independently. This documentation update does not modify any workflow JSON, enable sends, or update EspoCRM.

A future implementation may evaluate an authorized read-only PostgreSQL source, using a dedicated SELECT-only role, private Coolify networking, pagination, incremental checkpoints, overlap and idempotent replay. Verify Chatwoot-to-EspoCRM campaign/recipient/attempt mappings, raw Meta identity, data freshness, and license entitlement before use. Reading an Enterprise-associated table does not by itself establish authorization to use a paid feature. Compact metrics/checkpoints can go into n8n Data Tables; recipient-level history belongs in appropriately restricted records.

Relevant upstream references: `chatwoot/chatwoot` v4.19.0 `db/schema.rb`, `enterprise/app/models/campaign_recipient.rb`, and `enterprise/app/controllers/api/v1/accounts/campaigns/analytics_controller.rb`.
