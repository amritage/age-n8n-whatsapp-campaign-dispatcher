-- AGE v4.19 Chatwoot read-only recipient evidence extraction.
-- READ ONLY, use a dedicated SELECT-only Chatwoot PostgreSQL user.
-- $1: Chatwoot account integer ID; $2: Chatwoot campaign display ID integer.
-- Never execute outside authorized Chatwoot reporting environment.
-- source_id is the outbound provider response ID, but MUST be verified as Meta's
-- wamid on the deployed WhatsApp channel before creating AGE provider events.
SELECT
  c.id AS chatwoot_campaign_internal_id,
  c.display_id AS chatwoot_campaign_display_id,
  cr.id AS chatwoot_campaign_recipient_id,
  cr.contact_id AS chatwoot_contact_id,
  cr.inbox_id AS chatwoot_inbox_id,
  cr.source_id AS provider_message_id_candidate,
  cr.status AS status_enum,
  cr.error_code,
  cr.error_title,
  cr.error_message,
  cr.sent_at,
  cr.delivered_at,
  cr.read_at,
  cr.failed_at,
  cr.created_at,
  cr.updated_at
FROM campaign_recipients cr
JOIN campaigns c ON cr.campaign_id = c.id
WHERE c.account_id = $1
  AND cr.account_id = c.account_id
  AND c.display_id = $2
ORDER BY cr.id ASC;
