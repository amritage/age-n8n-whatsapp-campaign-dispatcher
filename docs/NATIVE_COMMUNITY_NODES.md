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

## The two preferred importable READ-ONLY workflows

| Order | File | Nodes and operations | HTTP fallback |
|---|---|---|---|
| 1 | `workflows/age-api-readiness-native.json` | Manual → EspoCRM Custom Entity: Get Campaign → AGE Summary GET → Chatwoot Campaign: Get → Chatwoot Campaign: Get Metrics → aggregate output | **One**: `GET /api/v1/AGECampaign/summary/:id` |
| 2 | `workflows/age-chatwoot-recipient-report-native.json` | Manual → Chatwoot Campaign: Get Metrics → Chatwoot Campaign: Get Recipients, `returnAll:true` → aggregate output | **Zero** |

Neither workflow has a scheduled trigger or a message/campaign creation operation. They do not write anything to EspoCRM or Chatwoot and do not persist raw recipient records to a database. Execution-data saving is disabled, but interim node outputs can still be viewed by authorized n8n users.

### Why one HTTP GET remains

`AGECampaign/summary/:id` is a **custom AGE Campaign Management route**, not an ordinary EspoCRM entity record. The existing EspoCRM community node supports generic entity CRUD, not this custom API operation. Faking `entityType='AGECampaign/summary'` would misuse the node and be brittle. Use **HTTP Request → GET** authenticated with its own n8n EspoCRM `X-Api-Key` Header Auth credential for this one endpoint. Do not duplicate all standard CRUD operations through HTTP.

For future native sending, Chatwoot's community node includes Campaign Create, Contact, Labels and Campaign Analytics. Creating the native campaign must still satisfy our globally locked cycle, current audience, consent, CRM tracking limitations and capacity policy. The existing extension's retry semantics remain the temporary 8/18/28 days **after each preceding** 131049 failure.

## Installation instructions (in your n8n 2.37.9 self-hosted deployment)

1. Make an n8n backup and inspect installed packages under **Settings → Community Nodes**. If these exact package names/versions are already installed, skip installation. Do not replace a different installed package without checking its effects on existing workflows.
2. Install and pin, if absent:
   - `@traien/n8n-nodes-espocrm@1.4.0`
   - `@renatoascencio/n8n-nodes-chatwoot@0.9.0`
3. If your n8n deployment runs with **separate workers/queue mode**, ensure workers can load the installed community node packages. Follow the n8n/community-node install method supported by your deployment, with a persistent volume/custom image where required. **Do not restart or upgrade existing production services just to import these diagnostics without a maintenance plan.**
4. In n8n credentials create/select:
   - `EspoCRM API`: instance HTTPS base URL + API key of a user with read access to Campaign.
   - `Chatwoot API`: instance HTTPS base URL, **numeric account ID**, user API token with campaign admin and `campaign_analytics` feature permission (not Agent Bot).
   - `HTTP Header Auth` for the sole custom AGE summary HTTP GET: header `X-Api-Key`, same read-only EspoCRM key or a separately scoped one. Never paste credentials into Code nodes / GitHub.
5. Import **as new workflows**, do not overwrite any existing n8n workflow. Keep them **inactive/manual**.
6. In `age-api-readiness-native.json` → `Configure IDs - No Secrets`, replace non-secret `REPLACE_ESPO_CAMPAIGN_ID`, `REPLACE_CHATWOOT_DISPLAY_ID`, `https://REPLACE_ESPO_HOST`; attach appropriate credentials to the EspoCRM, Chatwoot and HTTP GET nodes.
7. In `age-chatwoot-recipient-report-native.json` → `Set Existing Campaign ID - Fail Closed`, replace `REPLACE_CHATWOOT_CAMPAIGN_DISPLAY_ID`; attach Chatwoot credentials to both Chatwoot nodes. Use an **existing campaign with known reporting**, not a campaign to launch.
8. Execute manually. A successful diagnostic should output aggregate counts and `crmEventWriteAuthorized:false` or `liveSendAttempted:false`. **No real sending is performed.**
9. If reporting fails 403/404, confirm Chatwoot Enterprise `campaign_analytics` entitlement, role permissions and display ID. Do not install a new extension or attempt to bypass the feature gate.

## Original portable fallbacks retained

The prior `workflows/age-api-readiness-readonly.json` and `workflows/age-chatwoot-recipient-report-readonly.json` continue to use GET-only HTTP Request nodes and require **no community node installation**. If you decide not to install third-party packages, those are the approved fallback diagnostics. There is **no benefit to installing new packages solely to eliminate one stable HTTP GET** if maintenance/security burden exceeds the convenience.

## Tested versus not tested

- Confirmed native operations from the published package's GitHub source code.
- Static workflow safety tests assert **no send operations, no credentials and exact operation names**.
- n8n 2.37.9 CLI JSON-import compatibility can be tested in CI, but a bare n8n instance may accept an unknown community-node type at import: that alone is **not proof the package is installed or can execute**.
- NOT VERIFIED: packages installed on your n8n instance, live account credentials, actual Chatwoot analytics entitlement, native node execution against your EspoCRM/Chatwoot, and any CRM recipient event writes.


## Resolving "CONFIG_REQUIRED: enter an existing numeric Chatwoot campaign display ID"

This is a deliberate preflight error from the `Set Existing Campaign ID - Fail Closed` Code node, not an API/credential error. The recipient-report workflow requires an **already existing native Chatwoot campaign**; a logical EspoCRM campaign ID, Chatwoot account ID or WhatsApp inbox ID cannot substitute.

1. Import `workflows/age-chatwoot-find-campaign-ids-readonly.json` as a **new inactive** diagnostic workflow (requires `@renatoascencio/n8n-nodes-chatwoot@0.9.0`).
2. Attach your Chatwoot API credential to the single **Campaign → Get Many** node, and execute manually.
3. Read the last node's `campaigns[]` list and choose an existing WhatsApp one-off campaign ID. Use the numeric **`id`**, not the account/inbox/CRM ID.
4. In `workflows/age-chatwoot-recipient-report-native.json`, edit `Set Existing Campaign ID - Fail Closed`: replace `const id='REPLACE_CHATWOOT_CAMPAIGN_DISPLAY_ID';` with `const id='123';` using your REAL returned ID instead of the example `123`.
5. If no Chatwoot campaigns exist, recipient reporting cannot be tested yet. **Do not create or send a live campaign merely to generate an ID.** You can run ordinary EspoCRM Campaign GET checks separately, and plan a later explicitly authorized, opted-in pilot.
