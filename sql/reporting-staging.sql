-- AGE dispatcher PRIVATE PostgreSQL reporting schema (n8n's own PostgreSQL; NOT EspoCRM or Chatwoot DB).
-- REVIEW BEFORE APPLYING. This file does not migrate existing production data.
-- No raw phone numbers, names, message bodies, API keys or OAuth tokens.
-- observed_at is when a report was fetched; NEVER claim it is Meta's provider event time.

CREATE SCHEMA IF NOT EXISTS age_campaign_reporting;

CREATE TABLE IF NOT EXISTS age_campaign_reporting.batch (
 batch_id text PRIMARY KEY CHECK(length(batch_id) BETWEEN 1 AND 128),
 espo_campaign_id text NOT NULL,
 chatwoot_account_id bigint NOT NULL CHECK(chatwoot_account_id>0),
 chatwoot_campaign_display_id bigint NOT NULL CHECK(chatwoot_campaign_display_id>0),
 observed_at timestamptz NOT NULL DEFAULT now(),
 expected_recipients integer CHECK(expected_recipients >= 0),
 last_reconciled_at timestamptz,
 UNIQUE(chatwoot_account_id, chatwoot_campaign_display_id)
);

CREATE TABLE IF NOT EXISTS age_campaign_reporting.recipient_status (
 batch_id text NOT NULL REFERENCES age_campaign_reporting.batch(batch_id) ON DELETE RESTRICT,
 chatwoot_contact_id bigint NOT NULL CHECK(chatwoot_contact_id>0),
 espo_recipient_id text,
 status text NOT NULL CHECK(status IN ('queued','skipped','sent','failed','delivered','read')),
 error_code text,
 first_observed_at timestamptz NOT NULL DEFAULT now(),
 last_observed_at timestamptz NOT NULL DEFAULT now(),
 evidence_source text NOT NULL DEFAULT 'chatwoot_campaign_analytics',
 provider_message_id text,
 provider_event_at timestamptz,
 PRIMARY KEY(batch_id,chatwoot_contact_id),
 CHECK (provider_event_at IS NULL OR provider_message_id IS NOT NULL)
);

-- A recipient cannot be mapped to two Chatwoot contacts in the same batch.
CREATE UNIQUE INDEX IF NOT EXISTS age_campaign_reporting_unique_espo_link
 ON age_campaign_reporting.recipient_status(batch_id, espo_recipient_id)
 WHERE espo_recipient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS age_campaign_reporting_by_error
 ON age_campaign_reporting.recipient_status(batch_id,status,error_code);

CREATE TABLE IF NOT EXISTS age_campaign_reporting.check_run (
 run_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 check_name text NOT NULL,
 checked_at timestamptz NOT NULL DEFAULT now(),
 result text NOT NULL CHECK(result IN ('PASS','FAIL','BLOCKED','SKIP')),
 batch_id text REFERENCES age_campaign_reporting.batch(batch_id) ON DELETE RESTRICT,
 totals jsonb NOT NULL DEFAULT '{}'::jsonb,
 failure_reason_code text,
 evidence_source text NOT NULL
);

-- Example parameterized status upsert, intended for a future n8n Postgres node:
-- INSERT INTO age_campaign_reporting.recipient_status
-- (batch_id,chatwoot_contact_id,espo_recipient_id,status,error_code)
-- VALUES ($1,$2,$3,$4,$5)
-- ON CONFLICT (batch_id,chatwoot_contact_id) DO UPDATE SET
--  last_observed_at=now(),
--  status=CASE
--     WHEN EXCLUDED.status='read' THEN 'read'
--     WHEN recipient_status.status='read' THEN 'read'
--     WHEN EXCLUDED.status='delivered' THEN 'delivered'
--     WHEN recipient_status.status='delivered' THEN 'delivered'
--     WHEN recipient_status.status='failed' AND EXCLUDED.status IN ('queued','skipped','sent') THEN 'failed'
--     WHEN EXCLUDED.status='failed' THEN 'failed'
--     WHEN EXCLUDED.status='sent' THEN 'sent'
--     ELSE recipient_status.status END;
-- This is SAMPLE LOGIC ONLY. Implement ingestion within one transaction that first
-- checks campaign mapping, complete page count, consent, provenance and idempotency.
-- Reports are NOT evidence of Meta message IDs/times and must not blindly create EspoCRM events.
