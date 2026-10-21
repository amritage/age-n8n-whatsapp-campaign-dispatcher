# Target business rules

This is a **future-state requirements specification**, not an account of which features are implemented. **Must** denotes intended requirement; items labeled **PROPOSED** need owner approval before coding. Decision provenance: [DECISIONS.md](DECISIONS.md).

## 1. Scope and business purpose

**BR-001**: Support legitimate AGE B2B fabric outreach: new fabrics, availability, reintroductions, product developments, pricing/updates where appropriate, and other relevant approved communications. Correct buyer segmentation matters more than raw volume.

**BR-002**: Denim specifications use **oz**; cotton woven and knitted fabrics use **GSM**. Templates may use approved CRM attributes to present relevant products; never fabricate stock, price or approvals.

**BR-003**: Marketing campaigns are distinct from transactional/utility communications and agent-initiated service conversations. They may have different template, consent, window and frequency rules. Do not relabel marketing as utility to evade constraints.

**BR-004**: Live sending uses AGE's approved official Meta channel/inbox and approved message templates. Chatwoot replies remain accessible to agents. No WAHA contact-existence or unapproved direct-send workaround.

## 2. Campaign lifecycle and controls

**BR-010**: A campaign has owner, name, purpose, category, sender/inbox, template name/language/variables, audience definition, timezone, delivery target, window, pace, start/end dates, consent type and suppression policy.

**BR-011**: Support Draft, Scheduled, Active, Paused, Completed, Cancelled and Archived as conceptual lifecycle states. Only Active campaigns with the **global masterSendingEnabled** switch enabled can send. Campaign inactive or master OFF provides **DRY RUN**, never reservation or provider send; Cancelled/Archived cannot be reactivated without an explicit owner action.

**BR-012**: Emergency pause takes effect before reservation and again before provider POST. A circuit breaker also stops traffic after abnormal failure/quality/opt-out signals. Operator override can **decrease** safety limits immediately but cannot bypass opt-outs or Meta restrictions.

**BR-013**: Support both one-time **snapshot** membership and **dynamic/evergreen** refresh, with explicit refresh cadence and version of audience rules. Audiences can combine Account, Contact and Lead sources; support multiple selected audience segments and explicit inclusion/exclusion rules.

**BR-014**: Removal of an unsent recipient (zero attempts) must be available, audit logged and excluded from subsequent refresh/re-enrollment unless intentionally restored.

**BR-015**: DRY RUN returns a truthful count/reason breakdown (would send / cannot send / skipped / missing configuration) and optionally examples with masked phone numbers; no Chatwoot contact creation, ledger reservation or campaign status mutation.

## 3. Canonical recipients and segmentation

**BR-020**: Use a normalized international phone master ID as the primary destination identity. Deduplicate identical numbers across association records, sources and audience refreshes. Preserve all contributing Lead/Contact/Account links for attribution without multiplying sends.

**BR-021**: An inactive `CCommunicationAssociations.isActive=false` record cannot grant eligibility. Multiple active associations must be resolved using deterministic precedence for personalization; do not pick an arbitrary first record. If contradictory ownership/consent cannot be reconciled, hold for review.

**BR-022**: Revalidate canonical phone data, active associations, current audience membership, consent, opt-out, suppression, recipient status, template and destination routing directly before reservation and before send when material facts may have changed.

**BR-023**: Avoid hard-coded “Indian mobile only” as a universal requirement. Define allowed countries/phone types at campaign level. The existing India-only 91[6-9] rule is a campaign-specific configuration, not the whole product. Never infer WhatsApp registration from phone format alone.

**BR-024 (PROPOSED)**: If multiple campaigns target the same phone, coordinate with a phone-level cooldown and one outstanding marketing reservation; select by priority then due date, with deterministic tie-breaking. Overlapping campaigns never generate simultaneous duplicate promotional sends.

## 4. Consent, suppression and frequency

**BR-030**: Respect affirmative, applicable marketing eligibility under Meta requirements and law. Unknown, withdrawn or conflicting consent fails closed. Maintain consent source, purpose, timestamp, terms/version and audit trail wherever available.

**BR-031**: Canonical suppression/opt-out flags at the Communication master level override all campaigns. An association-level marketing “Opted Out”/“Suppressed” or historical unsubscribe must also block until verified and reconciled. Opt-outs apply immediately even during active sends or retry windows.

**BR-032**: Do not classify 131026 as verified non-registration. Store exact error code, provider reason, timestamps and evidence. Delivery failures alone cannot create an opt-in or override suppression.

**BR-033**: Minimum gap between marketing attempts to one phone is configurable across campaigns; historical AGE setting is **7 days**. Check last meaningful contact/attempt across all active senders as policy dictates, not just one recipient row. **PROPOSED**: use same phone master and marketing category as the primary shared-gap scope.

**BR-034**: Frequency changes and reintroduction sequences can be segment-specific, but higher frequency for “engaged” recipients needs explicit business approval and must never violate opt-outs. No permanent “last three failed” exclusion without an evidence-based, reversible policy.

## 5. Time, pacing and quota

**BR-040**: Use **Asia/Kolkata** for campaign business-date attribution unless explicitly configured otherwise. Historical working window: **08:50–20:10**, Sunday OFF. Campaign-specific windows can narrow these bounds. Verify the clock again before provider submission; prevent sends across a closed-window boundary.

**BR-041**: Pacing is sender-wide and adjustable; historical setting **45 seconds** minimum. Scheduled trigger frequency (historically every minute) is not proof that pacing or one-send-per-execution guarantees sender-wide exclusivity.

**BR-042**: The configurable **delivered target** counts unique Meta-confirmed delivered messages from attempts whose sending-day belongs to the sender’s local business day. Higher-order Read implies Delivered when supported by verified event semantics. Chatwoot acceptance alone never increments delivered.

**BR-043**: Pending/unknown submission outcomes occupy reserved quota until proved failed or resolved. Verified terminal failures do not consume the *delivered* target. Budget formula is target minus delivered minus outstanding reservations; deduplicate by provider/attempt identity.

**BR-044**: Add a **separate hard upper bound on submitted attempts and cost** plus concurrency and per-recipient retry limits. Otherwise a delivered-only target with many failed attempts may generate unlimited paid traffic. These hard limits are mandatory; the exact numerical settings are an **OPEN DECISION**.

**BR-045**: The global sender cap is authoritative across every campaign using that sender, with optional lower per-campaign allocation. Atomic claim/reserve, complete ledger accounting and sender-level locking prevent budget races. Never rely on a read-only preflight count alone.

**BR-046**: Delivery is asynchronous; a daily *delivered goal* is a target, not a guarantee of 200/600 deliveries within a day. Outcomes arriving later update their original sending-day bucket. A stale or incomplete ledger halts new submissions rather than inventing available capacity.

## 6. Provider error and retry rules

**BR-050**: Persist original Meta error code, detail, provider message ID, first/last failure timestamps and any retry-after evidence; map to structured reason categories only as **additional fields**.

**BR-051**: User preference: re-evaluate recoverable failed destinations after approximately **six calendar months** unless revised. **Do not send automatically** when the recipient opted out, lacks consent, is permanently prohibited, or provider policies prohibit the action. Six-month re-evaluation is not permission to ignore Meta quality restrictions.

**BR-052**: Error `131026` = undeliverable/unknown, **not definitive unregistered**; `130472` is a provider restriction/experiment class; `131049` indicates healthy-ecosystem engagement protection. Do not re-attempt rapidly, switch time of day to evade 131049, or force repeated marketing sends.

**BR-053**: Retry eligibility is calculated by **one authoritative policy service** using error category, cooldown, consent, frequency, campaign validity and current provider rules. The dispatcher must not independently maintain a hard-coded allowlist that contradicts this service.

**BR-054**: Each logical attempt has a stable idempotency identity; never auto-repeat a Chatwoot/Meta POST after a network timeout without provider-side evidence. Reconcile Reserved, Submitted, Unknown and terminal outcomes using a durable outbox.

## 7. Sending and outcomes

**BR-060**: Before sending, verify selected Chatwoot conversation, contact inbox, sender inbox and normalized recipient all correspond to the desired destination. If ambiguous or stale, fail closed and repair identity safely; do not reuse another number's conversation.

**BR-061**: Use only templates APPROVED for the correct WABA/inbox, name, language and variable shape. Template mismatch or failed preflight blocks send.

**BR-062**: Report independently: queued, evaluated, reserved, provider-submitted, provider-accepted/sent, delivered, read, replied, failed, suppressed, deferred, unknown. Submission is not delivery.

**BR-063**: Persist incoming delivery/read/failure webhooks with event IDs and provider timestamps, deduplicate, tolerate out-of-order events, and reconcile late events. Never regress Read to Failed because of a late/duplicate failure without explaining the provider event relationship.

**BR-064**: Every send and skip includes campaign, recipient, phone master, attempt, sender, template version, current checks, policy version and correlation IDs. Operators can explain **why** a recipient did or did not receive a message.

## 8. Availability and performance

**BR-070**: Work incrementally on indexed CRM queries, not an unbounded scan of history every minute. Persist durable cursor/checkpoint and use queue locking; fair scheduling prevents one blocked segment from starving another.

**BR-071**: If CRM, retry policy, message provider, event reconciliation or ledger correctness is unavailable, default to **no new send** with a specific reason and alert. Do not silently treat empty API output as consent or successful validation.

**BR-072**: Support replay-safe processing after worker restart, duplicated triggers and partial outages. Operator recovery must be auditable and cannot create duplicate sends.

**BR-073**: Maintain campaign-level and sender-level metrics, including delivered, failed by code, unknown, pending age, latency, pacing, hard-cap consumption, retries, suppression, circuit-breaker state and queue backlog.
