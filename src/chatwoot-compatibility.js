'use strict';

/**
 * Conservative Chatwoot *capability policy*, not an instance version detector.
 * Source inspected: v4.17.1 oneoff iterates contacts inline; v4.19.0 uses an
 * explicit 100-contact batch job. Do not infer deployment version from the
 * installed n8n community-node package version.
 */
function checkCompatibility({version,analyticsProbe,operations}={}){
 const v=String(version||'').trim().replace(/^v/,'');
 const result={
  chatwootVersion:v||null,
  nativeCampaignBatchingVerified:false,
  campaignAnalyticsVerified:analyticsProbe==='PASS',
  automaticSendingReady:false,
  reasons:[],
 };
 if(!/^\d+\.\d+\.\d+$/.test(v))result.reasons.push('INSTALLED_CHATWOOT_VERSION_UNVERIFIED');
 else if(v==='4.17.1')result.reasons.push('CHATWOOT_4_17_1_NO_100_CONTACT_BACKGROUND_BATCH_JOB');
 else if(v==='4.19.0')result.nativeCampaignBatchingVerified=true;
 else result.reasons.push('UNTESTED_CHATWOOT_RELEASE_BEHAVIOR');
 if(analyticsProbe!=='PASS')result.reasons.push('CAMPAIGN_ANALYTICS_NOT_PROVEN');
 if(operations?.complete!==true)result.reasons.push('RECIPIENT_MAPPING_AND_CAPACITY_LEDGER_NOT_PROVEN');
 // This module NEVER authorizes production dispatch: installed-version
 // provenance, private database/service connectivity and a consent-controlled
 // pilot require external, signed-off release gates.
 result.reasons.push('EXPLICIT_LIVE_RELEASE_APPROVAL_REQUIRED');
 return result;
}
module.exports={checkCompatibility};
