# AGE — WhatsApp Campaign Dispatcher

**Purpose:** Authoritative, future-state specification for automated, compliant, auditable B2B WhatsApp campaigns for **Amrita Global Enterprises (AGE)**. It is not a declaration that the current n8n deployment already meets this specification.

**Status:** Target design / requirements baseline. Implementation and live rollout require verification. All open choices are tracked in [the decision register](docs/DECISIONS.md).

## Business outcome

Send relevant fabric updates and offers to eligible business buyers with predictable pacing, reliable delivery accounting, and easy-to-audit records. Support contacts, leads, accounts, fabric manufacturers' buyers, trading firms, importers and exporters. A campaign must never be optimized for volume at the expense of customer preference, delivery quality, or accurate records.

- **EspoCRM** owns customers, canonical phone identities, active associations, audiences, consent/suppression, campaign configuration and recipient/attempt history.
- **n8n** orchestrates scheduling, reservation, dispatch, reconciliation, alerts and operational retries. It does not become a second customer CRM.
- **Official Meta WhatsApp Cloud API through the approved Chatwoot inbox** sends approved marketing templates; Chatwoot manages conversation and operator replies. Do not use WAHA existence checks or a QR/WhatsApp-Web gateway for official campaigns.
- **Event ingestion/reconciliation** records provider outcomes to EspoCRM. A successful Chatwoot POST means *submitted*, never *delivered*.

## Core principles

1. One canonical normalized destination/phone master; deduplicate across Lead/Contact/Account and campaigns.
2. Eligibility is evaluated when enrolled **and immediately before sending**, using current consent, suppression and audience membership rules.
3. Missing/ambiguous consent, identifiers, policy responses, budget evidence or provider identity **fail closed**.
4. **Active campaign + master sending enabled** is required for LIVE; otherwise provide a read-only DRY RUN or status preview. Emergency stop is immediate.
5. The business daily target measures **actual delivered messages**. Reserve places for pending/unknown submissions; verified failures release places, but a separate hard attempt/cost guard prevents unlimited failed traffic.
6. A global, atomic sender-level budget and message-spacing gate govern **all campaigns sharing the sending number**.
7. Preserve original Meta error codes and event timestamps; do not label 131026 as “Not Registered.”
8. Do not blindly retry an ambiguous submission. Recover from a durable outbox/ledger with evidence and idempotency.
9. Consent opt-out always overrides any six-month retry preference. Adhere to Meta requirements and applicable law.
10. Separate product/business **requirements** from any particular n8n node graph, extension version, or current deployment state.

## Documents

| Path | What it defines |
| --- | --- |
| [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md) | Campaign, audience, eligibility, calendar, quota, retry and outcome business rules |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Ownership boundaries, end-to-end flows and integration contracts |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Canonical entities, event semantics, field and state contracts |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Confirmed decisions, proposals and questions needing sign-off |
| [docs/TEST_PLAN.md](docs/TEST_PLAN.md) | Measurable acceptance criteria and failure simulations |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Safety, observability, access, incident recovery and runbooks |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | Implementation order and deployment gates |
| [AGENTS.md](AGENTS.md) | Rules for human/AI developers working in this repository |
| [config/policy.example.json](config/policy.example.json) | Documented, non-secret example configuration—not a live policy |

## Repository contract

- This repository is the dispatcher’s design and implementation source, **not** the central AGE company knowledge repository and **not** the EspoCRM Campaign Management extension repository.
- Keep future production code in `src/`, importable n8n workflows in `workflows/`, and executable tests in `tests/`. Do not invent production-ready exports or commit environment-specific identifiers.
- Any future implementation must be traceable to numbered business rules and tests.
- Never commit API tokens, passwords, complete customer lists, recipient phone numbers, personal message payloads, webhook signatures or n8n credential objects.
- Changes to LIVE eligibility, consent, retry, budgeting or sending require review and dry-run testing before deployment.

**Important:** The previously supplied “AGE — EspoCRM WhatsApp Campaign Dispatcher v4 — Production” JSON was examined to understand legacy behavior and gaps, but intentionally is **not** declared the target architecture or included here as a production workflow. This repository defines what the system **should** do.
