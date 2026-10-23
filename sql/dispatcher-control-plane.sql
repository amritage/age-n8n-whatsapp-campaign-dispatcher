-- AGE Multi-Campaign Dispatcher control plane v1, PostgreSQL >=16.
-- PRIVATE N8N POSTGRES DATABASE ONLY. Not Chatwoot or EspoCRM production DB.
-- Apply ONLY after review/backup. Default state is FAIL-CLOSED and NO LIVE SENDING.
-- Keep user PII, phone numbers, contact names, tokens and WhatsApp message content OUT.

CREATE SCHEMA IF NOT EXISTS age_dispatcher;

CREATE TABLE IF NOT EXISTS age_dispatcher.portfolio (
  portfolio_id text PRIMARY KEY,
  messaging_tier integer CHECK (messaging_tier IS NULL OR messaging_tier > 0),
  tier_verified_at timestamptz,
  quality_verified_at timestamptz,
  external_usage_verified_at timestamptz,
  external_unique_24h integer CHECK (external_unique_24h IS NULL OR external_unique_24h >= 0),
  master_sending_enabled boolean NOT NULL DEFAULT false,
  operator_live_approved boolean NOT NULL DEFAULT false,
  provider_analytics_verified boolean NOT NULL DEFAULT false,
  account_health_verified boolean NOT NULL DEFAULT false,
  unresolved_external_sends boolean NOT NULL DEFAULT true,
  last_verified_cycle_completed_at timestamptz,
  active_cycle_id text,
  modified_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS age_dispatcher.cycle (
  cycle_id text PRIMARY KEY,
  portfolio_id text NOT NULL REFERENCES age_dispatcher.portfolio(portfolio_id),
  status text NOT NULL DEFAULT 'BLOCKED' CHECK (status IN
    ('BLOCKED','PLANNED','RESERVED','LAUNCH_UNKNOWN','LAUNCHING','PROCESSING','PROCESSING_COMPLETE','SETTLED','ABORTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_batch_completed_at timestamptz,
  settlement_verified_at timestamptz,
  completed_at timestamptz,
  -- A completed Chatwoot campaign alone does not mean Meta receipts are settled.
  CHECK (status <> 'SETTLED' OR (last_batch_completed_at IS NOT NULL AND settlement_verified_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS age_cycle_by_portfolio ON age_dispatcher.cycle(portfolio_id, created_at DESC);

CREATE TABLE IF NOT EXISTS age_dispatcher.batch (
  batch_id text PRIMARY KEY,
  cycle_id text NOT NULL REFERENCES age_dispatcher.cycle(cycle_id),
  espo_campaign_id text NOT NULL,
  chatwoot_campaign_display_id bigint,
  chatwoot_inbox_id bigint NOT NULL,
  immutable_label_name text NOT NULL,
  immutable_label_id bigint,
  intended_count integer NOT NULL DEFAULT 0 CHECK(intended_count >= 0),
  state text NOT NULL DEFAULT 'PLANNED' CHECK(state IN
    ('PLANNED','LABEL_PREPARED','POST_UNKNOWN','SCHEDULED','PROCESSING','PROCESSING_COMPLETE','SETTLED','ABORTED')),
  payload_sha256 text CHECK(payload_sha256 IS NULL OR payload_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  provider_completed_at timestamptz,
  UNIQUE(chatwoot_inbox_id, immutable_label_name),
  UNIQUE(chatwoot_campaign_display_id)
);

-- Stable opaque recipient key = application hash/HMAC of portfolio+verified recipient identity.
-- Never store an unhashed phone, username, BSUID or contact name in the ledger.
CREATE TABLE IF NOT EXISTS age_dispatcher.reservation (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portfolio_id text NOT NULL REFERENCES age_dispatcher.portfolio(portfolio_id),
  cycle_id text NOT NULL REFERENCES age_dispatcher.cycle(cycle_id),
  batch_id text REFERENCES age_dispatcher.batch(batch_id),
  espo_campaign_id text NOT NULL,
  espo_recipient_id text NOT NULL,
  recipient_identity_key text NOT NULL CHECK(length(recipient_identity_key) BETWEEN 32 AND 256),
  identity_type text NOT NULL CHECK(identity_type IN ('PHONE','BSUID')),
  chatwoot_contact_id bigint,
  status text NOT NULL DEFAULT 'RESERVED' CHECK(status IN
    ('RESERVED','SUBMISSION_UNKNOWN','SUBMITTED','SENT','DELIVERED','READ','FAILED','SKIPPED','EXCLUDED')),
  error_code text,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  provider_message_id text,
  provider_event_at timestamptz,
  UNIQUE(cycle_id,recipient_identity_key),
  UNIQUE(cycle_id,espo_recipient_id),
  CHECK(provider_event_at IS NULL OR provider_message_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS age_reservation_recent
  ON age_dispatcher.reservation(portfolio_id,reserved_at DESC,recipient_identity_key);
CREATE INDEX IF NOT EXISTS age_reservation_errors
  ON age_dispatcher.reservation(error_code,reserved_at DESC);

CREATE TABLE IF NOT EXISTS age_dispatcher.control_audit (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  happened_at timestamptz NOT NULL DEFAULT now(),
  portfolio_id text,
  cycle_id text,
  event_type text NOT NULL,
  decision text NOT NULL CHECK(decision IN ('PASS','BLOCKED','FAIL','INFO')),
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Read-only safety diagnostic. It NEVER returns can_send=true on its own:
-- a live release is separately authorized and the sender remains absent.
CREATE OR REPLACE VIEW age_dispatcher.preflight_view AS
WITH recent AS (
  SELECT portfolio_id,
    COUNT(DISTINCT recipient_identity_key) FILTER (WHERE reserved_at >= now()-interval '24 hours')::integer AS reserved_unique_24h,
    COUNT(*) FILTER (WHERE status IN('RESERVED','SUBMISSION_UNKNOWN','SUBMITTED'))::integer AS outstanding_attempts
  FROM age_dispatcher.reservation GROUP BY portfolio_id
)
SELECT p.portfolio_id, p.messaging_tier, p.external_unique_24h,
  COALESCE(r.reserved_unique_24h,0) AS reserved_unique_24h,
  COALESCE(r.outstanding_attempts,0) AS outstanding_attempts,
  GREATEST(0,COALESCE(p.messaging_tier,0)-COALESCE(p.external_unique_24h,0)-COALESCE(r.reserved_unique_24h,0)) AS conservative_headroom,
  p.active_cycle_id, p.last_verified_cycle_completed_at, p.master_sending_enabled, p.operator_live_approved,
  p.provider_analytics_verified, p.account_health_verified, p.unresolved_external_sends,
  CASE
    WHEN NOT p.master_sending_enabled THEN 'MASTER_DISABLED'
    WHEN NOT p.operator_live_approved THEN 'OPERATOR_APPROVAL_MISSING'
    WHEN NOT p.provider_analytics_verified THEN 'ANALYTICS_NOT_VERIFIED'
    WHEN NOT p.account_health_verified THEN 'ACCOUNT_HEALTH_NOT_VERIFIED'
    WHEN p.messaging_tier IS NULL OR p.tier_verified_at IS NULL OR p.tier_verified_at < now()-interval '24 hours' THEN 'TIER_UNKNOWN_OR_STALE'
    WHEN p.quality_verified_at IS NULL OR p.quality_verified_at < now()-interval '24 hours' THEN 'QUALITY_UNKNOWN_OR_STALE'
    WHEN p.unresolved_external_sends OR p.external_unique_24h IS NULL OR p.external_usage_verified_at IS NULL
      OR p.external_usage_verified_at < now()-interval '24 hours' THEN 'EXTERNAL_USAGE_UNKNOWN_OR_STALE'
    WHEN p.active_cycle_id IS NOT NULL THEN 'CYCLE_IN_PROGRESS_OR_UNKNOWN'
    WHEN p.last_verified_cycle_completed_at IS NOT NULL
      AND p.last_verified_cycle_completed_at > now()-interval '26 hours' THEN 'GLOBAL_26_HOUR_GAP'
    WHEN GREATEST(0,COALESCE(p.messaging_tier,0)-COALESCE(p.external_unique_24h,0)-COALESCE(r.reserved_unique_24h,0))=0 THEN 'NO_CONSERVATIVE_HEADROOM'
    ELSE 'READY_FOR_OTHER_PRECHECKS'
  END AS reason,
  false AS can_send
FROM age_dispatcher.portfolio p LEFT JOIN recent r USING(portfolio_id);

-- No public reserve function here: user/device consent, 131050 suppression,
-- dynamic membership, template health, signed pilot approval and provider ledger
-- must be wired and validated in integration tests before creating the mutation API.
-- Do not add a fake n8n 'canSend=true' to bypass the required checks.

-- Example safe seed (operator must decide actual portfolio_id):
-- INSERT INTO age_dispatcher.portfolio (portfolio_id) VALUES ('REAL_META_PORTFOLIO_ID')
-- ON CONFLICT DO NOTHING;
-- All safety fields remain disabled/unknown until separately evidenced.
