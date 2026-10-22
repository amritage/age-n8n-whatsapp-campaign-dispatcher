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

## Corrected zero-ID workflow design (22 October 2026)

**No campaign ID, host URL or other operational value needs to be edited into a Code node.** You configure the installed EspoCRM and Chatwoot credentials **once** inside n8n; from then on the workflow discovers all matching campaigns directly.

| File | Native node operations | Behavior |
|---|---|---|
| `workflows/age-api-readiness-native.json` | EspoCRM **Custom Entity → Get Many (Campaign, Return All)** → Chatwoot **Campaign → Get Many** | Independently lists the two campaign inventories; checks both connections; **does not assume that names or IDs match**. No HTTP Request nodes |
| `workflows/age-chatwoot-recipient-report-native.json` | Chatwoot Campaign → **Get Many → Get Metrics → Get Recipients (Return All)** | Discovers the latest completed native WhatsApp one-off campaigns and retrieves their results without entering IDs. Supports manual run or an hourly schedule once activated and tested |

Only **completed** `one_off` campaigns whose inbox `channel_type` is `Channel::Whatsapp` enter the reporting step. Non-WhatsApp website campaigns and in-flight campaigns are excluded. There is a conservative cap of **40 completed native WhatsApp campaigns per run**: more produces `SAFE_SCAN_LIMIT_EXCEEDED` rather than quietly reporting incomplete coverage. This cap is a diagnostic safety bound, not a permanent reporting policy.

**No Chatwoot campaign ID is present in EspoCRM until the new dispatcher creates a Chatwoot batch and records its returned display ID.** For future live operation the dispatcher **must record** `EspoCRM Campaign ID ↔ n8n cycle/batch ID ↔ Chatwoot campaign display ID ↔ recipients` in its private transaction ledger. Attempting to associate historical Chatwoot campaigns with EspoCRM by guessing their names would be unsafe.

**These current two workflows are read-only diagnostics**, not sending or persistent CRM event-sync workflows. The readiness workflow no longer checks the custom `AGECampaign/summary/:id` endpoint because it is per-campaign; this is a separately outstanding compatibility check, not silently proven by ordinary Campaign Get Many.

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

