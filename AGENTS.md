# Instructions for AI agents and human contributors

This repository's purpose is to maintain **the approved future-state business behavior** of AGE's WhatsApp campaign dispatcher and its implementation. Follow these rules:

1. Read `README.md`, `docs/BUSINESS_RULES.md`, `docs/DECISIONS.md` and `docs/TEST_PLAN.md` before proposing code.
2. Respect **Confirmed**, **Proposed**, **Open** distinctions. Don't silently turn a recommendation into a business-approved rule.
3. Do not deploy, enable master sending, change live credentials, call Chatwoot send API, or mutate customer data without explicit operator authorization.
4. Default to DRY RUN, synthetic test data, least privilege and fail-closed policy behavior.
5. Treat EspoCRM canonical Communications and campaign extension as owners of customers, suppressions, audience, retry policy and campaign config. Do not create a competing customer CRM in n8n.
6. Do not weaken suppression, opt-outs, sender-wide rate controls or unknown-outcome idempotency to boost throughput.
7. Preserve the exact Meta error code and date; do not equate 131026 with unregistered.
8. Do not add the historical v4 JSON as “production approved” or claim the design is implemented without tests.
9. Every functional change references BR numbers, changes/extends acceptance tests and documents the migration/rollback risk.
10. Never commit secrets, personal customer lists, credentials, private keys or unredacted webhook/event payloads.
11. Keep changes limited to this repository unless separate authorization is granted; do not edit company-core, governance or EspoCRM repos implicitly.
12. Use small reviewed commits; no force pushes or destructive history rewriting by default.

## Approved 2026-10-21 architecture

Read `docs/CHATWOOT_CAMPAIGN_ORCHESTRATION.md`, `docs/ESPOCRM_CHATWOOT_API_CONTRACT.md`, and `docs/WORKFLOW_NODE_MAP.md` before any workflow edit. Native Chatwoot one-off campaign creation is the selected sending mechanism. Do not modify Chatwoot source code, reintroduce 45-second per-message dispatch, or separate the Meta portfolio-wide 26h gap into per-campaign gaps. The only included importable n8n JSON files are deliberately inert shells; never describe them as production-ready. Preserve D0+8/18/28 for 131049 and suppression/review eligibility.
