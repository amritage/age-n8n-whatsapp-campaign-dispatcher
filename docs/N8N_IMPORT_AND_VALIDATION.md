# AGE n8n import checklist — pre-production READ-ONLY diagnostics

Status: import-verified on **n8n 2.37.9** in temporary GitHub Actions container; user production connection NOT tested; no send capability enabled.

## Preferred zero-ID import path (corrected 2026-10-22)

Your n8n screenshot confirms both required community-node packages are already installed. **You do NOT need to configure or enter EspoCRM campaign IDs, Chatwoot campaign IDs, account IDs, inbox IDs or host URLs in these new workflows.** The two node credentials carry the account/host authentication details.

| Import order | Workflow file | Automatically discovers | Expected response |
|---|---|---|---|
| 1 | [`age-api-readiness-native.json`](../workflows/age-api-readiness-native.json) | **All** EspoCRM Campaign records via the EspoCRM node; **all** Chatwoot Campaign records via the Chatwoot node | CRM/Chatwoot inventory counts and native WhatsApp one-off campaign list, with explicit `crossSystemCampaignMappingVerified:false` |
| 2 | [`age-chatwoot-recipient-report-native.json`](../workflows/age-chatwoot-recipient-report-native.json) | Completed WhatsApp one-off campaigns, **per-campaign metrics and all recipient pages** (up to 40 completed campaigns per run) | Delivered/read/failed/sent/skipped counts by Chatwoot campaign, error-code frequencies; no direct CRM event writes |

**Steps:** Import as **new** workflows, choose the already installed EspoCRM API and Chatwoot API credentials in the relevant native nodes, then **Execute Workflow** manually. They are inactive by default. The reporting workflow includes an hourly Schedule Trigger, but scheduling does not run until you explicitly activate the workflow after validating a manual run.

The old imported copies still contain `Configure IDs - No Secrets` and `Set Existing Campaign ID - Fail Closed`; **do not keep editing them**. Reimport these updated JSON files as new workflows instead. The finder workflow and individual campaign IDs are no longer required.

The reporting workflow filters `campaign_type=one_off`, `inbox.channel_type=Channel::Whatsapp`, and `campaign_status=completed`. If **no native Chatwoot one-off campaign exists**, it returns a safe zero-campaign report, without asking for an ID or creating a campaign.

A full EspoCRM↔Chatwoot historical match is **not available just from the campaign lists**. For actual automated sending, the future dispatcher will create one-off batches and store the returned Chatwoot campaign ID alongside the CRM campaign ID in a private durable ledger. These two workflows are **read-only diagnostics**, not a live sender or production EspoCRM status synchronizer.

Both required community node packages are already installed per your screenshot: `@traien/n8n-nodes-espocrm@1.4.0` and `@renatoascencio/n8n-nodes-chatwoot@0.9.0`. No additional installation is needed. [Native-node details](NATIVE_COMMUNITY_NODES.md).

---

## Legacy HTTP GET-only fallback (requires IDs; not preferred)

| Order | File | Purpose | Does it send? |
|---|---|---|---|
| 1 | `workflows/age-api-readiness-readonly.json` | Verify existing EspoCRM Campaign + AGE summary and existing Chatwoot Campaign + analytics metrics endpoints. | **NO**, manual GET only |
| 2 | `workflows/age-chatwoot-recipient-report-readonly.json` | Read a previously sent Chatwoot campaign's paginated per-recipient statuses/error codes and return only aggregate totals. | **NO**, manual GET only |
| Do NOT import for a live rollout yet | `workflows/age-multi-campaign-cycle-controller.json` | Inert architecture shell, hourly schedule with a never-send gate. | No; cannot dispatch |
| Do NOT import for a live rollout yet | `workflows/age-chatwoot-campaign-reconciliation.json` | Inert architecture shell, hourly schedule with a never-send gate. | No; cannot persist CRM results |

**Never activate or substitute these workflows for the existing production dispatcher.** No existing EspoCRM extension or workflow needs changing for these checks.

## Before the manual test

1. n8n: **Import from URL** using the raw GitHub URL of each exact JSON file above, or **Import from File**. The GitHub repository may be private; use an authorized download rather than assuming n8n can fetch it without credentials. Do not replace an existing workflow, even if the names look similar.
2. Both imported diagnostics are disabled and use Manual Trigger. Keep them unpublished/inactive.
3. Create/select **two separate n8n Header Auth credentials**:
   - EspoCRM: header name `X-Api-Key`, value from an authorized **read-only user** API key.
   - Chatwoot: header name `api_access_token`, value from an authorized **read-only-capable** Chatwoot account admin with campaign analytics access. Chatwoot may have wider account privileges; limit who can execute and safeguard the token.
   - **Do not paste credentials into JSON, a Code node, GitHub or this test log.** Attach them to the correct GET nodes in the n8n GUI.
4. Set non-secret placeholders in each workflow's first configuration Code node:
   - `espoUrl`: installed HTTPS EspoCRM root, **without** `/api/v1`.
   - `espoCampaignId`: existing CRM campaign ID (not display name).
   - `chatwootUrl`: installed HTTPS Chatwoot root, **without** `/api/v1`.
   - `chatwootAccountId`: account numeric ID.
   - `chatwootCampaignId`: numeric **Chatwoot campaign display ID**, not EspoCRM campaign ID or internal PostgreSQL campaign ID.
5. Select an **existing completed or previously used Chatwoot WhatsApp native one-off campaign** for analytics testing. No customer contact is initiated by GET.
6. In workflow settings, confirm **Save successful executions = Do not save**, **Save failed executions = Do not save**, and **Save manual executions = Off**. The reporting workflow ships with these disabled to reduce saved customer data. Editor data may still be visible to authorized n8n users running the workflow.

## Manual execution

1. Run only `age-api-readiness-readonly.json` (Manual Trigger). Its last node **Read-only Summary - Counts Only** should indicate readable CRM and Chatwoot campaign/metrics. If 401, inspect token/account permissions without weakening security; if 403, check campaign analytics entitlement; if 404, confirm correct campaign IDs and installed API.
2. Run only `age-chatwoot-recipient-report-readonly.json` (Manual Trigger). Expected final output: `{mode:"READ_ONLY",audience,counts,deliveredInclusiveOfRead,errorCodeCounts,crmEventWriteAuthorized:false}`. Compare counts against Chatwoot UI. `read` recipients also count toward delivered total. Failed attempts stay distinct from unsent/skipped.
3. Record **redacted** PASS/FAIL/BLOCKED in `reports/TEST_LOG.md` (through a separate authorized GitHub workflow/PR), with n8n version, installed Chatwoot version, installed AGE extension version, campaign ID (non-sensitive), totals, observed vs expected and exact error code. **Do not publish recipient IDs, phone numbers, message contents or API keys in GitHub.**

## What constitutes a valid PASS?

- Both workflows import into your actual n8n without corrupted node parameters.
- The first diagnostic returns successful EspoCRM and Chatwoot GETs.
- The second diagnostic fetches all contact pages, verifies API counters and returns aggregate counts consistent with the UI.
- No send, label creation, contact upsert, campaign creation, database migration or EspoCRM event writes occur.

## What this import does NOT prove

The two automated **sending** workflows remain inert. An actual go-live needs a verified atomic global 26-hour cycle reservation, current dynamic recipient eligibility, accurately accounted portfolio capacity, Chatwoot unique-batch label creation and campaign POST, event-level identity mapping and Chatwoot/CRM asynchronous attempt reconciliation. The existing AGE Campaign Management `/AGECampaign/attempt` semantics require a separate compatible solution, **without changing the old extension**. The temporary 131049 policy follows that extension's preceding-failure offsets.

## Test provenance

- [n8n 2.37.9 real import / all regression PASS](https://github.com/amritage/age-n8n-whatsapp-campaign-dispatcher/actions/runs/39754290485)
- [Prior failed import before workflow IDs were supplied](https://github.com/amritage/age-n8n-whatsapp-campaign-dispatcher/actions/runs/39753830543)
- Private reporting PostgreSQL DDL: `sql/reporting-staging.sql`; tested separately on disposable PostgreSQL 16, **not applied to live n8n**.
