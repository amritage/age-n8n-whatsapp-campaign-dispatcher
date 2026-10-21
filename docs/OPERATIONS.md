# Operations and controls

## Environments and authority

- **Design/documentation** may be edited without touching live campaigns.
- **Development:** synthetic/dummy phone identities and mocked provider; no real sends.
- **Pilot:** explicitly approved recipient list and capped real sends with operator watching.
- **Production:** formally enabled versioned workflow, master send switch, credentials from secure n8n store and dedicated minimum-privilege identities.
- No API key, credential ID that reveals secret material, phone list, webhooks with authentication tokens, or full customer message payload in Git commits or issue comments.

## Operator controls

- One global emergency kill switch before every send.
- Campaign Active/Paused controls separate from global sender circuit breakers.
- Daily delivered goal, strict attempts/spend guard, pacing, window, country and phone/category allowlist.
- Campaign owners cannot bypass globally suppressed or opted-out customers.
- Changes to high-impact thresholds are auditable and require approval.

## Monitoring (sender-wide and campaign-wide)

Track: attempts, submitted, delivered, read, replied, failed, unknown, reserved, unresolved after timeout, delivery ratio, failure rate by exact Meta code, first/last event timestamps, opt-outs, spend estimates and actuals, budget age, discrepancy count, queue age, cursor progress, policy API latency and provider availability.

Alerts:
- Reconciliation behind expected interval / source of truth stale
- Rising 131049, 131026, 130472 or unclassified error count
- Missing/invalid template, sender/inbox mismatch
- Repeated provider 5xx, CRM errors or unknown submission bursts
- Hard cap reached, duplicate attempt key, inconsistent budget
- Accidental workflow activation on wrong sender or campaign

## Incident playbook

1. **Stop** new reservations and provider POSTs using the master switch; do not mutate recipient histories to hide failures.
2. **Preserve evidence:** n8n execution ID, reservation/attempt keys, Chatwoot and provider message IDs, webhook events, API response/error and timestamps (redact secrets and PII).
3. **Classify:** rejected before reservation; Reserved but not Submitted; Submitted; Unknown; Failed; Delivered; inconsistent.
4. **Reconcile** from durable event and provider evidence. Never resend an Unknown solely because the timeout was reached.
5. **Resolve** ledger inconsistencies, restore budget claims, update CRM projections idempotently.
6. **Dry run**, replay tests and approve a small pilot before resuming regular sending.
7. **Write a concise incident note** with root cause, affected counts, customer impact and prevention.

## Changes and upgrades

- Keep n8n exports sanitized and versioned; pin supported platform versions.
- Update EspoCRM extension and dispatcher integration contracts together; verify backwards-compatible field names.
- Use a review/approval workflow for changes involving live sends.
- Deployment does not occur merely because GitHub content changes.
- Never use production data in public examples; retain audit evidence under access controls and a suitable retention policy.
