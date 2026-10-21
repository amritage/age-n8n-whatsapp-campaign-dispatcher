# AGE Campaign Management v0.4.3 compatibility (READ-ONLY inspection, 2026-10-21)

**Important:** This is a comparison against the **GitHub source of v0.4.3**, not verification that this version is installed in production. User explicitly prohibited modifications to earlier extensions or existing n8n workflows. No such modifications are made.

Source repo: https://github.com/amritage/age-campaign-management

## Verified endpoints / fields from existing source
- Native standard EspoCRM `GET /api/v1/Campaign/:id` and list queries (including AGE fields).
- `GET /api/v1/AGECampaign/summary/:campaignId`.
- `GET /api/v1/AGECampaign/retry-policy/:recipientId` is read-only, provides `errorPolicyAllowed`, `reason`, `errorCode`, `retryAt`.
- `GET /api/v1/AGECampaign/phone-result/:phoneNumberId` gives latest result.
- `POST /api/v1/AGECampaign/enroll` accepts 1–200 **phone master IDs** per request, never Contact/Account IDs.
- `POST /api/v1/AGECampaign/attempt` creates an immediate `Submitted` live attempt with `submitOnce:true`; requires the Campaign Active/Tracking Enabled, fresh (<5-minute) external eligibility results, correct master, consent/suppression/holds and repeat-attempt reconciliation.
- `POST /api/v1/AGECampaign/event` appends evidence; `messageId` is required for regular statuses including failed with a provider identity. Request-rejected failures without message ID have a narrow exception; missing ID for a normal status is **not** allowed.
- Audience segment and recipient entities: `CAGEAudienceSegment`, `CAGEAudienceSegmentMember`, `CAGECampaignRecipient`; native Campaign has `ageAudienceSegmentsIds`, `ageTemplateName`, `ageTemplateLanguage`, `ageParameters`, `ageInboxId`, `ageWindowStart/End`, `ageSundayOff`, `ageTimeZone`, `startDate/endDate`, `ageDailyLimit`, `ageMinGapDays`. Need inspect deployed metadata for all actual fields and mandatory attributes.
- Segment recalculation and Campaign Refresh Segment & Enroll Now run in **native EspoCRM background jobs** (0.4.2/0.4.3). A request to refresh is not proof refresh completed; query job/result timestamps before using membership.

## BLOCKER B-001: 131049 schedule does not match approved target
- User-confirmed policy in dispatcher: retries at **D0+8, D0+18, D0+28**, where D0 is the original 131049 failure.
- Existing `WhatsAppPolicy.php` v0.4.3 increments failure count and computes `[8,18,28][failures-1]` days **after each respective failure event**, yielding approximately D0+8, D0+26, D0+54 if each occurs as soon as allowed.
- Therefore, the existing `/AGECampaign/attempt` server-side gate may deny Day 18 and Day 28 submissions. n8n MUST NOT bypass or misreport that gate, regardless of dispatcher preference. The adapter should show `BLOCKED_BY_CRM_POLICY_CONFLICT`; leave unsent.
- No old-extension change authorized. Remedy requires a separately approved compatibility approach. Do not label the solution end-to-end production-ready until policies align.

## BLOCKER B-002: batch campaign create versus immediate CRM attempt semantics
- Existing `/AGECampaign/attempt` requires an eligible reservation immediately before **individual** provider submission, and marks it Submitted upon reservation.
- A Chatwoot native one-off campaign owns its own asynchronous internal 100-contact processing groups and may run longer than the timing assumptions of old individual-send dispatcher.
- Need an evidence-backed procedure to correlate each committed CRM attempt to an actual Chatwoot campaign recipient without falsely recording unsent people as Submitted, including partial batches and campaign-start failures.
- `mode:historical` is for importing past evidence, **not** a substitute for pre-send consent and policy authorization. Never use it to circumvent B-001.

## BLOCKER B-003: individual analytics omit message event identities
- Chatwoot v4.19 Enterprise `analytics/contacts` returns Chatwoot contact ID, status and error codes, **without Meta message ID and provider event timestamps**.
- The AGE `/AGECampaign/event` endpoint requires reliable provider message ID, real event type/timestamp and a matching AGE attemptId. Cannot infer these from date of polling or status labels.
- v4.19 `campaign_recipients` database table has `source_id`, `sent_at`, `delivered_at`, `read_at`, `failed_at`, `error_code/title/message`, `campaign_id`, `contact_id` and `inbox_id`. A future **read-only** DB query can supply extra evidence without any Chatwoot code modification, subject to verifying permissions, version, actual Meta ID semantics and clean contact mapping.
- Until the required evidence is available, the bridge can report campaign totals / partial status information in **its own report** but **must not** manufacture `AGECampaign/event` payloads.

## BLOCKER B-004: exact Meta rolling remaining capacity
- Meta portfolio messaging tier does not expose a verified Chatwoot API that supplies accurate `total / used / remaining` from all senders.
- Must ensure confirmed tier, all sender accounts and manual/external sends covered by a conservative portfolio ledger. A 26h gap does **not** prove unused capacity if other senders operate.

## Safe next steps without editing old systems
1. Execute `node scripts/run-readiness.js` with separately provided **read-only** EspoCRM and Chatwoot API credentials and known Campaign IDs. This makes only HTTP GET calls, does not log secrets or customer rows.
2. Verify the installed EspoCRM extension version and the Chatwoot `campaign_analytics` entitlement (especially for self-hosted).
3. Obtain *read-only* Chatwoot DB access or authoritative Meta delivery webhook evidence for message IDs/timestamps, after opt-in and access review.
4. Validate audience freshness, template parameter payload, deterministic label/recipient mapping and global portfolio usage.
5. Resolve B-001 and B-002 through explicit design approval without altering any prior code by assumption. Only then build/enable actual campaign creation.
6. Run a controlled opted-in pilot after a separate, explicit live-send approval. Record every PASS/FAIL/blocked result in `reports/TEST_LOG.md`, and never store phone lists or API credentials in GitHub.

## Reference source
- https://github.com/amritage/age-campaign-management/blob/main/docs/API.md
- https://github.com/amritage/age-campaign-management/blob/main/files/custom/Espo/Modules/AGECampaignManagement/Domain/WhatsAppPolicy.php
- https://github.com/amritage/age-campaign-management/blob/main/files/custom/Espo/Modules/AGECampaignManagement/Services/TrackingService.php
- https://github.com/chatwoot/chatwoot/blob/v4.19.0/enterprise/app/controllers/api/v1/accounts/campaigns/analytics_controller.rb
- https://github.com/chatwoot/chatwoot/blob/v4.19.0/db/migrate/20260807133000_create_campaign_recipients.rb
