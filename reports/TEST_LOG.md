# Persistent AGE multi-campaign integration results

This file tracks historical **observed** results and blockers. GitHub Actions also preserves per-commit success/failure logs for unit tests. These are not claims of live deployment.

| Date (UTC) | Area | Result | Evidence / limitation | Follow-up |
|---|---|---|---|---|
| 2026-10-21 | GitHub AGE Campaign Management 0.4.3 API source inspection | PASS | Native Campaign GET and AGE summary/retry-policy/read-only routes documented | Compare deployed version and access |
| 2026-10-21 | Chatwoot v4.19 Enterprise campaign analytics code inspection | PASS | Individual status/errors endpoint identified; 25 per page | Verify account entitlement via read-only probe |
| 2026-10-21 | D0+8/18/28 vs CRM policy | BLOCKED | CRM v0.4.3 holds 131049 retries **8/18/28 days from preceding errors**; conflicts with approved **initial-failure offsets** | Explicitly approved compatibility approach; don't bypass CRM |
| 2026-10-21 | CRM live attempt vs asynchronous Chatwoot native batch | BLOCKED | Existing live attempt marks Submitted immediately; may misstate queued/unsent campaign recipients | Design evidence-based attempt accounting |
| 2026-10-21 | Chatwoot analytics to CRM event | BLOCKED | Analytics omit actual Meta message ID and event time needed by CRM event API | Verify read-only Chatwoot campaign_recipients DB query / Meta webhook |
| 2026-10-21 | Portfolio rolling 24h remaining capacity | UNVERIFIED | 26h gap alone doesn't cover outside/manual senders | Obtain complete usage evidence |
| 2026-10-21 | n8n importable workflow shells | DESIGNED / NOT LIVE | Inert by design; no HTTP or DB writes | Implement verified adapters in new repo |
| 2026-10-21 | Node unit tests and workflow safety | PASS (mocked) | GitHub Actions run [39634539986](https://github.com/amritage/age-n8n-whatsapp-campaign-dispatcher/actions/runs/39634539986), commit `0930864`: JS syntax; workflow safety; 26h planner; 131049 D0 offsets; all-pages analytics; guarded provider-message evidence; read-only API mocks | Repeat on integration changes |
| 2026-10-21 | Initial CI workflow creation | FAIL (fixed) | Run [39634220083](https://github.com/amritage/age-n8n-whatsapp-campaign-dispatcher/actions/runs/39634220083) executed before the subsequent tests file was committed, causing module-not-found; later run [39634363532](https://github.com/amritage/age-n8n-whatsapp-campaign-dispatcher/actions/runs/39634363532) passed | Resolved: rerun after repository files completed |
| 2026-10-21 | Live EspoCRM/Chatwoot read-only probe | NOT RUN | No installed-service credentials/known campaign IDs supplied to this session | Operator to supply secure read-only access |
| 2026-10-21 | Real WhatsApp pilot | NOT RUN | No controlled live test authorized or environment access | Do not contact customers |

### Recording convention
- PASS = successfully exercised with stated evidence and scope; FAIL = tested and produced incorrect behavior; BLOCKED = cannot safely proceed; SKIP/NOT RUN = not attempted, **never count as PASS**.
- Always record date/time, system version, commit, scenario, observed/expected behavior, failure reason/error code, remediation and retest status.
- Do not commit API keys, complete phone numbers, identifiable message payloads, personal data or production session logs.
- Update this register after every implementation milestone; CI logs remain attached to their workflow runs (not automatically committed into this file).
