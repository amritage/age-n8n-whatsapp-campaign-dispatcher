# AGE — WhatsApp Campaign Orchestrator (EspoCRM → n8n → Chatwoot)

**Current approved direction (2026-10-21):** native Chatwoot v4.19.0 one-off WhatsApp campaign batches, multi-campaign EspoCRM coordination, one shared Meta-portfolio sending cycle and global **26-hour gap after the last verified batch completion**. Hourly scheduling and separate reconciliation. **No Chatwoot source changes, no 45-second individual pacing.** Implementation is design-stage, NOT deployed or cleared for LIVE. Read [the new architecture](docs/CHATWOOT_CAMPAIGN_ORCHESTRATION.md) before older dispatcher documents.

**Purpose:** Authoritative, future-state specification for automated, compliant, auditable B2B WhatsApp campaigns for **Amrita Global Enterprises (AGE)**. It is not a declaration that the current n8n deployment already meets this specification.

**Status:** Target design / requirements baseline. Implementation and live rollout require verification. All open choices are tracked in [the decision register](docs/DECISIONS.md).

## Before importing into n8n (verified 2026-10-22)

**Start with just the two manual, GET-only diagnostic workflows** documented in [N8N_IMPORT_AND_VALIDATION.md](docs/N8N_IMPORT_AND_VALIDATION.md). Their four-workflow package passed actual **n8n 2.37.9 CLI import**, but only the two read-only diagnostics are worth importing now. The multi-campaign controller and status-sync scheduler are intentionally non-sending design shells, **not a finished live dispatcher**. The two diagnostics need secure instance credentials and an existing Chatwoot campaign ID; no production API call has been run from this development session.


## Current import recommendation — automatic campaign discovery (22 October 2026)

**Use the revised native-node workflows: no campaign ID or host URL is entered manually.** Connect each installed native EspoCRM/Chatwoot credential once.

- [Auto-discover EspoCRM and Chatwoot campaigns](workflows/age-api-readiness-native.json): native EspoCRM `Campaign → Get Many` and Chatwoot `Campaign → Get Many`, with independent inventories and no HTTP Request nodes.
- [Auto-report completed native Chatwoot WhatsApp campaigns](workflows/age-chatwoot-recipient-report-native.json): native Chatwoot `Get Many → Get Metrics → Get Recipients`, with accurate per-campaign recipient-status attribution checks. Includes a disabled-by-default hourly trigger (only executes on activation) and a manual trigger.
- [Latest zero-ID import instructions](docs/N8N_IMPORT_AND_VALIDATION.md). The previous `CONFIG_REQUIRED: enter ... ID` diagnostic versions are **superseded**; previously imported copies do **not update automatically**. Reimport the latest files as new workflows.
- Chatwoot ↔ EspoCRM campaigns cannot be safely matched by name alone; future native sends must persist the explicit batch-to-campaign mapping. **No live sends or CRM event writes are present** in these diagnostics.


## Business outcome

Send relevant fabric updates and offers to eligible business buyers with predictable pacing, reliable delivery accounting, and easy-to-audit records. Support contacts, leads, accounts, fabric manufacturers' buyers, trading firms, importers and exporters. A campaign must never be optimized for volume at the expense of customer preference, delivery quality, or accurate records.

- **EspoCRM** owns customers, canonical phone identities, active associations, audiences, consent/suppression, campaign configuration and recipient/attempt history.
- **n8n** orchestrates scheduling, reservation, dispatch, reconciliation, alerts and operational retries. It does not become a second customer CRM.
- **Chatwoot native one-off campaign API** sends approved WhatsApp templates in its own batches; n8n creates unique batch labels/campaigns. The native campaign engine does not automatically persist pending unsent audiences across days; EspoCRM owns the queue. Do not use WAHA existence checks or a QR/WhatsApp-Web gateway for official campaigns.
- **Event ingestion/reconciliation** records provider outcomes to EspoCRM. A successful Chatwoot POST means *submitted*, never *delivered*.

## Core principles

1. One canonical normalized destination/phone master; deduplicate across Lead/Contact/Account and campaigns.
2. Eligibility is evaluated when enrolled **and immediately before sending**, using current consent, suppression and audience membership rules.
3. Missing/ambiguous consent, identifiers, policy responses, budget evidence or provider identity **fail closed**.
4. **Active campaign + master sending enabled** is required for LIVE; otherwise provide a read-only DRY RUN or status preview. Emergency stop is immediate.
5. The business daily target measures **actual delivered messages**. Reserve places for pending/unknown submissions; verified failures release places, but a separate hard attempt/cost guard prevents unlimited failed traffic.
6. A global, atomic **Meta portfolio-level** capacity/cycle gate governs all campaigns sharing the portfolio; **26h between cycles**, not between constituent campaigns. No n8n per-message pacing.
7. Preserve original Meta error codes and event timestamps; do not label 131026 as “Not Registered.”
8. Do not blindly retry an ambiguous submission. Recover from a durable outbox/ledger with evidence and idempotency.
9. Consent opt-out always overrides any six-month retry preference. Adhere to Meta requirements and applicable law.
10. Separate product/business **requirements** from any particular n8n node graph, extension version, or current deployment state.

## Documents

| Path | What it defines |
| --- | --- |
| [docs/CHATWOOT_CAMPAIGN_ORCHESTRATION.md](docs/CHATWOOT_CAMPAIGN_ORCHESTRATION.md) | Approved native-Chatwoot multi-campaign cycle design and verified v4.19 findings |
| [docs/ESPOCRM_CHATWOOT_API_CONTRACT.md](docs/ESPOCRM_CHATWOOT_API_CONTRACT.md) | Proposed integration API and ledger boundaries; unverified live adapters |
| [docs/CAMPAIGN_SCENARIOS.md](docs/CAMPAIGN_SCENARIOS.md) | 4200→4150→4500, shared capacity, current 131049 timing and 180-day hold examples |
| [docs/RETRY_POLICY_TEMPORARY.md](docs/RETRY_POLICY_TEMPORARY.md) | Current existing-extension 131049 schedule and deferred initial-failure preference |
| [docs/WORKFLOW_NODE_MAP.md](docs/WORKFLOW_NODE_MAP.md) | Node map and safety status of importable n8n shells |
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

## Current implementation in this repo

- `src/cycle-planner.js`: pure-JavaScript fail-closed multi-campaign allocation planner; run `node tests/cycle-planner.test.js` locally.
- `tests/cycle-planner.test.js`: baseline safety, dedupe, weekday and 26-hour tests.
- `workflows/age-multi-campaign-cycle-controller.json` and `workflows/age-chatwoot-campaign-reconciliation.json`: **importable but inert** n8n shells, not production integration. No HTTP nodes, secrets, sends, or automated contact mutations are active.
- Missing for LIVE: actual EspoCRM adapter implementation, safe atomic ledger, Meta usage evidence, Chatwoot template/label/API integration, reconciliation and tested alerting. **Never enable LIVE merely from these files.**

## 2026-10-21 read-only API integration progress

The existing AGE Campaign Management v0.4.3 GitHub API source (not confirmed as the installed production version) was reviewed **without editing that repository**. The live attempt API and retry-policy incompatibilities are recorded in [Actual Extension Compatibility](docs/ACTUAL_EXTENSION_COMPATIBILITY.md). The user expressly prohibited modifying previous extensions and n8n workflows; these remain untouched.

- Node API probe: `node scripts/run-readiness.js`. It makes only GET requests; missing environment setup yields SKIP, not PASS. Runtime configuration requires `AGE_ESPO_URL`, `AGE_ESPO_API_KEY`, `AGE_ESPO_CAMPAIGN_ID`, `AGE_CHATWOOT_URL`, `AGE_CHATWOOT_TOKEN`, `AGE_CHATWOOT_ACCOUNT_ID`, `AGE_CHATWOOT_CAMPAIGN_ID`. Use operator-controlled secure environment variables; **do not commit them**.
- Existing campaign field translation and *guarded* Chatwoot native campaign JSON: `src/campaign-contract.js`; no network write implemented.
- Chatwoot analytics pagination and normalized status-only evidence: `src/chatwoot-analytics.js`.
- Chatwoot PostgreSQL **read-only** evidence extraction: `sql/chatwoot-campaign-recipient-evidence-readonly.sql`, with strict `wamid` and mapping validation in `src/evidence-mapper.js`. Not deployed; database source semantics need installed-instance validation.
- **Temporary compatible retry policy** (8/18/28 days after each preceding 131049 failure) with a fail-closed CRM policy gate: `src/retry-policy.js`. This matches the reviewed v0.4.3 extension without modifying or bypassing it. The preferred initial-failure-offset plan is deferred.
- Full synthetic tests run on GitHub Actions; [permanent result log](reports/TEST_LOG.md). Latest verified CI run: [39634948221](https://github.com/amritage/age-n8n-whatsapp-campaign-dispatcher/actions/runs/39634948221), PASS. No production messages sent or service credentials used.

**Production blockers:** B-001 retry interval conflict is temporarily resolved by honoring the existing extension (installed version still to verify); B-002 immediate live attempt vs asynchronous native batch, B-003 missing provider identifiers in analytics, B-004 unknown complete portfolio rolling usage remain open. No old extension or workflow changed. The n8n workflow JSONs remain safe non-sending design shells until actual integrations can be tested.


## Read-only n8n diagnostic (new, safe first integration step)

`workflows/age-api-readiness-readonly.json` is an **inactive, manual-trigger, GET-only** diagnostic with four existing supported API checks: EspoCRM Campaign, AGE summary, Chatwoot campaign and Chatwoot aggregate campaign analytics. Fill non-secret host/account/campaign placeholders and bind separate EspoCRM `X-Api-Key` and Chatwoot `api_access_token` header-auth credentials **inside n8n**. Never commit or paste production secrets into GitHub. See [workflow map](docs/WORKFLOW_NODE_MAP.md). This diagnostic is not a live sender and its actual network execution is **unverified**.

**Temporary retry decision:** use existing AGE Campaign Management's 131049 cooldown of 8, then 18, then 28 days after each preceding failure (theoretical D0+8/+26/+54). Preferred D0+8/+18/+28 from initial failure is deferred, not removed. The existing extension remains unchanged; see [decision and caveats](docs/RETRY_POLICY_TEMPORARY.md).


## 2026-10-22 integration milestone

**New executable read-only component:** `src/read-only-reconciliation.js` fetches paginated Chatwoot v4.19 Enterprise campaign contacts and campaign metrics over authenticated GET, checks complete page counts and metric consistency, and provides per-recipient *opaque-ID/status* projections without exporting phone numbers, names or message bodies. Its **API operation code** was exercised with mocked responses; no live account tokens used.

**New importable manual n8n workflow:** `workflows/age-chatwoot-recipient-report-readonly.json` retrieves all 25-item analytics pages and reports individual status categories and failure-code counts. It has 3 GET nodes, no POST/write, no embedded API credential or hard-coded instance host, is inactive by default, and disables saving manual/error/success executions. It **does not** yet save any per-recipient record or update EspoCRM. See [reporting integration runbook](docs/REPORTING_IMPLEMENTATION.md).

**New private Postgres staging schema:** `sql/reporting-staging.sql` provides recipient status rows and success/failure test-run audit, separate from Chatwoot and EspoCRM databases. Schema idempotence and synthetic recipient inserts **passed on a temporary PostgreSQL 16 CI database**, but the schema has not been applied to the production n8n database.

**Evidence:** [GitHub Actions run 39751912969](https://github.com/amritage/age-n8n-whatsapp-campaign-dispatcher/actions/runs/39751912969) PASS for both `unit-and-safety` and `postgres-report-schema` jobs. See [permanent test log](reports/TEST_LOG.md). **No live sending or existing extension/workflow changes.**

## 2026-10-22: preferred dedicated EspoCRM and Chatwoot n8n nodes

AGE prefers **dedicated community nodes** when their operations exist: [native-node installation guide](docs/NATIVE_COMMUNITY_NODES.md) and [revised import checklist](docs/N8N_IMPORT_AND_VALIDATION.md).

- `workflows/age-api-readiness-native.json`: EspoCRM Custom Entity → Get (Campaign), Chatwoot Campaign → Get/Metrics, and exactly **one custom AGE summary HTTP GET**.
- `workflows/age-chatwoot-recipient-report-native.json`: Chatwoot Campaign → Get Metrics/Get Recipients, with **Return All** to paginate; zero HTTP nodes.
- Community packages pinned: `@traien/n8n-nodes-espocrm@1.4.0` and `@renatoascencio/n8n-nodes-chatwoot@0.9.0`. **Not built into a clean n8n installation.** Installing them is a separate deliberate operator action, especially for queue-mode workers. Credentials stay in n8n; no tokens are embedded in workflow JSON.
- The two older HTTP Request-only diagnostic workflows remain as portable fallbacks, and the sending/reconciliation controller shells remain disabled and non-sending. No old AGE extensions or old n8n workflows changed.
