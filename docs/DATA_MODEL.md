# Target data and state contracts

These are **logical contracts**, not a claim that every field already exists in EspoCRM. EspoCRM extension migrations/schema changes belong in its own repository. Prefer canonical normalized identifiers over redundant shadow fields.

## 1. Campaign

- `campaignId`, `name`, `category`, `status`, `owner`, `senderId`, `inboxId`
- `templateName`, `templateLanguage`, `templateVersion`, `parameterMapping`
- `audienceSpec`, `audienceVersion`, `refreshMode` = Snapshot | Dynamic
- `timeZone`, `startAt`, `endAt`, `windowStart`, `windowEnd`, `sundayOff`
- `dailyDeliveredTarget` (per campaign), `minGapDays`, `campaignPriority`
- `policyVersion`, `createdBy`, `approvedBy`, `lastChangedAt`
- Global `masterSendingEnabled` is a **separate** emergency safety switch, not campaign metadata.

## 2. Recipient / enrollment

- `recipientId`, `campaignId`, `phoneMasterId`, normalized `destination`
- Origin associations / source Lead, Contact and Account identifiers, `audienceVersion`
- `status`, `scheduledAt`, `lastAttemptAt`, `attemptCount`, `latestAttemptId`
- `hasDelivered`, `hasRead`, `hasReplied`, `hasUnsubscribed`, `needsReview`
- `cancelled`, `enrolledAt`, `removedAt`, `removalReason`, `lastEligibilityVerdict`
- Unique campaign+phone master enrollment identity (or explicit versioned re-enrollment rule) to prevent duplicates.

## 3. Canonical Communication phone master

- `id`, `normalizedNumber`, country code and validated phone type
- `whatsAppStatus` (informational status where supported), validation timestamp/source
- `whatsAppOptedOut`, `globallySuppressed`, `suppressionReason`
- `lastWhatsAppStatus`, `lastWhatsAppStatusAt` and provider error metadata as appropriate
- `whatsAppLastErrorCode`, `whatsAppLastErrorAt`, provider error description, next eligible review (proposed)
- Provenance and audit for consent/suppression decisions
- **Do not reintroduce** the deprecated `whatsAppRegistrationStatus` as the canonical rule or treat `131026` as definite non-registration.
- Keep master state canonical; avoid redundant, conflicting `lastValidatedAt` / `whatsAppLastCheckedAt` concepts unless the timestamps mean different things.

## 4. Communication associations

- `id`, `phoneNumberId`, `relatedEntityType`, `relatedRecordId`, `accountId`, `isActive`
- `marketingStatus`, recipient/company display attributes, source/provenance
- Associations disabled with `isActive=false` do not authorize marketing and remain available for historical traceability.

## 5. Attempt ledger (append-only events + current projection)

Each logical sending attempt has:
- `attemptId` (immutable unique idempotency key), `recipientId`, `campaignId`, `phoneMasterId`, `senderId`
- `attemptBusinessDay` derived at **reservation/submission** in sender-local timezone
- `status` = Reserved | CancelledBeforeSend | Submitted | Accepted | Sent | Delivered | Read | Failed | Unknown
- `reservedAt`, `submittedAt`, `providerEventAt`, `settledAt`; correlated `chatwootMessageId` and `providerMessageId`
- `providerErrorCode`, `providerErrorText`, `errorSource`, `retryPolicyVersion`
- `eligibilitySnapshot`, `consentVersion`, `campaignVersion`, `templateVersion`
- Evidence/reconciliation status, payload hash, per-attempt send claim/lease and audit timestamps
- A durable reservation may not be treated as safe to resend simply because it is old.

### Status order and invariants

`Queued → Reserved → Submitted → Accepted/Sent → Delivered → Read` is a typical successful projection. A Failed outcome can appear after Submitted/Accepted; Unknown means there is not enough verified evidence. Replied is a separate interaction fact, not a replacement for Delivered. Keep raw provider events even when late/conflicting.

- Only one active sender POST per logical attempt; provider sends must be idempotent or explicitly reconciled.
- Delivered/Read counts are unique per logical provider message, not per webhook event.
- Confirmed Failed settles delivery budget as failed; Unknown remains reserved.
- A late failure event cannot erase confirmed Read without forensic review of event identity.
- Never delete historical attempt events to “repair” counts.

## 6. Sender-wide budget

Keys: `senderId` + `businessDay` + `policyVersion`. Fields:
- `deliveredTarget` and `deliveredCount`
- `pendingReservations`, `failedCount`, `submittedAttemptCount`
- `hardAttemptLimit`, `spendLimit`, `lastSendAt`, `nextAllowedSendAt`
- `reconciledAt`, `ledgerWatermark`, `isComplete`, `qualityPause`
- All mutations guarded by atomic claim/version compare. A snapshot is **informational** without a successful atomic reserve.

## 7. Events, identifiers and audit

At minimum capture: `eventId`, `receivedAt`, `providerOccurredAt`, `provider`, `senderId`, `campaignId`, `recipientId`, `attemptId`, `chatwootMessageId`, `providerMessageId`, `eventType`, `errorCode`, raw payload reference/hash, processing revision and dedupe key.

Deduplication key should favor the provider event ID or a stable combination of provider message ID, event type and provider timestamp. Maintain orphan/unmatched event queue; never drop unlinked failures silently. Audit operator changes to consent, suppression, campaign state, limit overrides and manual recovery.

## 8. API return contract (PROPOSED)

Every policy/service result should carry:
- `requestId`, `candidateId`, `phoneMasterId`, `campaignId`, `decision`: ALLOW | DENY | REVIEW
- `reasonCodes[]`, `policyVersion`, `evaluatedAt`, `expiresAt`
- `nextReviewAt` when blocked for cooldown; structured `evidence` for audit
- An ALLOW decision only authorizes further steps; it is **not** a sender-budget reservation or final send authorization.
