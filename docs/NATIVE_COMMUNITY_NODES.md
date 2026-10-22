# AGE native EspoCRM + Chatwoot n8n nodes (preferred read-only diagnostics)

## Decision and release bounds

AGE prefers dedicated EspoCRM and Chatwoot nodes wherever those nodes implement the required call. This architecture **does NOT require modifying** AGE's current EspoCRM extensions, previous n8n workflows or Chatwoot source.

Two audited **community** npm packages (not official built-in n8n nodes):

| Provider | Exact recommended package version | n8n node type | Scope verified from source |
|---|---|---|---|
| EspoCRM | `@traien/n8n-nodes-espocrm@1.4.0` | `@traien/n8n-nodes-espocrm.espoCrm` | `Custom Entity → Get` for `Campaign`, getAll for custom CRM entities |
| Chatwoot | `@renatoascencio/n8n-nodes-chatwoot@0.9.0` | `@renatoascencio/n8n-nodes-chatwoot.chatwoot` | `Campaign → Get`, `Get Metrics`, `Get Recipients` (Return All), `Create` (future), labels/contacts |

Sources inspected on 2026-10-22:
- https://github.com/traien/n8n-nodes-espocrm/blob/main/nodes/EspoCRM/EspoCRM.node.ts
- https://github.com/serversmx/n8n-nodes-chatwoot/blob/main/nodes/Chatwoot/resources/campaign/index.ts
- https://github.com/serversmx/n8n-nodes-chatwoot/blob/main/nodes/Chatwoot/Chatwoot.node.ts

**Security note:** Installing a community package executes third-party code with n8n permissions. Review source and package permissions, keep a backup and **pin versions** rather than auto-updating on the production instance. n8n in queue mode may require the packages to be available on every worker that executes these workflows. Existing community nodes may already be installed under **different packages**; the new JSON references these exact two packages, and **is not interchangeable** with an older Chatwoot node of the same display name.

## Optimized zero-ID workflows — production-safe read-only checks

Both apps' node credentials are configured **once** in n8n. No campaign IDs, account IDs, host URLs or tokens belong in Code nodes.

| Workflow | Primary operations | Cost / result |
|---|---|---|
| `workflows/age-api-readiness-native.json` | EspoCRM Custom Entity Get All Campaigns + Chatwoot Campaign Get All | Connection and inventory check; caps **displayed** inventory at 25 per app, while counting all discovered campaigns |
| `workflows/age-chatwoot-recipient-report-native.json` | Chatwoot Campaign Get All → Campaign Get Metrics → Campaign Get Recipients **filtered to Failed** | Checks current/late campaigns in rotating groups of **5** per **6-hour** reporting window, aggregating delivered/read/sent/failed/skipped and Meta error-code frequency. Avoids downloading all successful recipient details each time |

Report selection includes **processing** WhatsApp one-offs and completed one-offs with completion times in the preceding **14 days**; old campaigns without completion timestamps remain discoverable until timestamp semantics are verified. A fixed 6-hour rotation cycles among all groups of five instead of permanently skipping every campaign beyond a cap. The most recent group can shift if campaigns are added, so this is a **bounded health diagnostic, not guaranteed durable exhaustive historical reconciliation**.

The workflow is **inactive until you explicitly activate it**. Manual Trigger works without activation. Six-hour schedule and 600-second timeout are configured; native API nodes retry once after 3 seconds on an error. Execution payload saving is disabled; credentials remain in n8n.

If the Chatwoot account lacks `campaign_analytics` entitlement (enterprise feature), the workflow reports `BLOCKED` for that campaign, never invents delivery results or modifies records. The Chatwoot inventory can be checked independently of this entitlement.

### Important workflow boundaries

- The new reporter uses **metrics for success totals** and only **failed recipient analytics for error codes**; it does not collect a complete per-recipient delivered/read history. Detailed event-level CRM sync needs verified Meta message IDs, timestamps and an AGE attempt mapping.
- CRM Campaign IDs and Chatwoot campaign display IDs are unrelated. No name-based guessing is permitted. Future sender must record its generated Chatwoot batch mappings explicitly.
- No Chatwoot source changes, EspoCRM extension changes, new production databases or previous n8n workflow updates. **No sends are present.**
- The custom AGE `/AGECampaign/summary/:id` endpoint is **not** checked by these native inventory nodes, so do not interpret inventory success as complete AGE extension API readiness.

## Installation and import (once per n8n installation)

1. Existing screenshot confirms both exact packages **already installed**: `@traien/n8n-nodes-espocrm@1.4.0` and `@renatoascencio/n8n-nodes-chatwoot@0.9.0`. **Do not reinstall.**
2. Import the **latest revised** `age-api-readiness-native.json` and `age-chatwoot-recipient-report-native.json` **as new workflows**. The old imported workflow still contains `Configure IDs - No Secrets`; it cannot update itself from GitHub. Do not overwrite any previous production workflow.
3. In n8n select your existing `EspoCRM API` credential on the EspoCRM Get Many node and your existing `Chatwoot API` credential on the Chatwoot Get Many / Get Metrics / Get Recipients nodes. No Header Auth or URL placeholders are needed in the new native workflows.
4. Run the readiness workflow manually once: its final output should show `espoCampaignCount`, `chatwootCampaignCount` and `chatwootNativeWhatsAppCount`. It will **not** fabricate an Espo↔Chatwoot campaign mapping.
5. Run reporting manually. If there are no completed native WhatsApp campaigns, it returns `campaignCount:0`, not a missing-ID error. If analytics is unavailable, 401/403/404 must be treated as an entitlement or permissions gate, not solved by inserting a random campaign ID.
6. Enable the **new read-only reporting workflow's hourly schedule only after a successful pilot**. All sends remain disabled; the old n8n dispatcher/AGE extension are untouched.

## Original portable fallbacks retained

The prior `workflows/age-api-readiness-readonly.json` and `workflows/age-chatwoot-recipient-report-readonly.json` continue to use GET-only HTTP Request nodes and require **no community node installation**. If you decide not to install third-party packages, those are the approved fallback diagnostics. There is **no benefit to installing new packages solely to eliminate one stable HTTP GET** if maintenance/security burden exceeds the convenience.

## Tested versus not tested

- Confirmed native operations from the published package's GitHub source code.
- Static workflow safety tests assert **no send operations, no credentials and exact operation names**.
- n8n 2.37.9 CLI JSON-import compatibility can be tested in CI, but a bare n8n instance may accept an unknown community-node type at import: that alone is **not proof the package is installed or can execute**.
- NOT VERIFIED: packages installed on your n8n instance, live account credentials, actual Chatwoot analytics entitlement, native node execution against your EspoCRM/Chatwoot, and any CRM recipient event writes.


## Why you previously saw CONFIG_REQUIRED

Earlier workflow exports mistakenly asked for manual EspoCRM and Chatwoot campaign IDs. Those exports have been **superseded** by the two zero-ID auto-discovery workflows above. Do not edit or reuse the older imported versions. The `age-chatwoot-find-campaign-ids-readonly.json` diagnostic remains available for one-off troubleshooting but is no longer required to run the new reporting flow.

