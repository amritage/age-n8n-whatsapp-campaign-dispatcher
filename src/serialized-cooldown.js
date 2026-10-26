'use strict';

/**
 * BR-020, BR-024, BR-033 / D-18 (2026-10-25).
 *
 * PURE POLICY ONLY. EspoCRM owns the canonical phone and linked attempt
 * history; this function never authorizes a provider send by itself.
 *
 * Caller MUST obtain every non-deleted CAGECampaignRecipient linked by
 * phoneNumberId (across ALL WhatsApp marketing campaigns and all pages),
 * including cancelled and failed records. A partially paged or stale query
 * is not acceptable. Do not feed Chatwoot message timestamps, which may be
 * service replies or different message categories.
 */
function fail(message) { throw new Error('MARKETING_COOLDOWN_UNVERIFIED: ' + message); }
function stringId(value, field) {
  if (typeof value !== 'string' || !value.trim()) fail('Missing ' + field);
  return value.trim();
}
function instant(value, field) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)) {
    fail('Missing/ambiguous UTC or offset time: ' + field);
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) fail('Invalid time: ' + field);
  return ms;
}
function parseHistory(raw, recipientId) {
  let parsed;
  try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { fail('Unreadable history for recipient ' + recipientId); }
  if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.attempts)) {
    fail('Incomplete history for recipient ' + recipientId);
  }
  return parsed.attempts;
}
function evaluateMarketingCooldown(input) {
  if (!input || typeof input !== 'object') fail('Missing input');
  const master = stringId(input.phoneMasterId, 'phoneMasterId');
  if (input.scanComplete !== true || input.scopedByPhoneMaster !== true ||
      input.allCampaignsIncluded !== true || input.historyFull !== true) {
    fail('All campaigns, full history and complete pagination must be verified');
  }
  if (!Array.isArray(input.recipientRows)) fail('recipientRows must be an array');
  if (!Number.isSafeInteger(input.minimumGapDays) || input.minimumGapDays < 7 ||
      input.minimumGapDays > 3650) fail('Minimum marketing gap must be >= 7 days');
  const now = instant(input.now, 'now');
  const gapMs = input.minimumGapDays * 86400000;
  const seenRecipients = new Set();
  const seenAttempts = new Set();
  const pending = new Set(['Submitted','Accepted','Sent']);
  let newestAt = null, newestRecipientId = null, unresolved = false, attemptsExamined = 0;

  for (const row of input.recipientRows) {
    if (!row || typeof row !== 'object') fail('Invalid recipient row');
    const id = stringId(row.id, 'recipient.id');
    if (seenRecipients.has(id)) fail('Duplicate recipient id ' + id);
    seenRecipients.add(id);
    if (row.phoneNumberId !== master || row.channel !== 'WhatsApp') {
      fail('Unexpected recipient ownership/channel for ' + id);
    }
    // The caller must provide ALL history; do not accept a summary-only row.
    const attempts = parseHistory(row.history, id);
    if (!Number.isSafeInteger(row.attemptCount) ||
        row.attemptCount !== attempts.length) {
      fail('Attempt count and history disagree for ' + id);
    }
    if (attempts.length && (typeof row.status !== 'string' || !row.status)) {
      fail('Missing latest attempt status for ' + id);
    }
    if (attempts.length && pending.has(row.status)) unresolved = true;
    for (const attempt of attempts) {
      if (!attempt || typeof attempt !== 'object') fail('Invalid attempt record');
      const attemptId = stringId(attempt.attemptId, 'attemptId');
      if (seenAttempts.has(attemptId)) fail('Duplicate attemptId in phone history');
      seenAttempts.add(attemptId);
      const at = instant(attempt.startedAt, 'attempt.startedAt');
      if (at > now) fail('Future attempt timestamp');
      attemptsExamined++;
      if (newestAt === null || at > newestAt) {
        newestAt = at;
        newestRecipientId = id;
      }
    }
  }

  if (unresolved) return {
    allowed: false, reason: 'UNRESOLVED_PREVIOUS_ATTEMPT',
    lastAttemptAt: newestAt === null ? null : new Date(newestAt).toISOString(),
    nextAllowedAt: null, sourceRecipientId: newestRecipientId, attemptsExamined
  };
  const nextAt = newestAt === null ? null : newestAt + gapMs;
  return {
    allowed: nextAt === null || now >= nextAt,
    reason: nextAt !== null && now < nextAt ? 'GLOBAL_MARKETING_COOLDOWN' : 'COOLDOWN_ONLY_PASSED',
    lastAttemptAt: newestAt === null ? null : new Date(newestAt).toISOString(),
    nextAllowedAt: nextAt === null ? null : new Date(nextAt).toISOString(),
    sourceRecipientId: newestRecipientId, attemptsExamined
  };
}

/**
 * De-duplicate one execution's candidate set BEFORE any CRM attempt or
 * Chatwoot label/write. This is not an inter-process lock.
 */
function chooseOneCampaignPerPhone(candidates) {
  if (!Array.isArray(candidates)) fail('Candidate array required');
  const sorted = candidates.map(c => {
    if (!c || typeof c !== 'object') fail('Invalid candidate');
    stringId(c.phoneMasterId, 'candidate.phoneMasterId');
    stringId(c.campaignId, 'candidate.campaignId');
    stringId(c.recipientId, 'candidate.recipientId');
    if (!Number.isSafeInteger(c.priority) || c.priority < 0) fail('Invalid priority');
    return c;
  }).sort((a,b) => b.priority - a.priority ||
    String(a.campaignId).localeCompare(String(b.campaignId)) ||
    String(a.recipientId).localeCompare(String(b.recipientId)));
  const used = new Set();
  return sorted.filter(c => {
    if (used.has(c.phoneMasterId)) return false;
    used.add(c.phoneMasterId);
    return true;
  });
}

module.exports = { evaluateMarketingCooldown, chooseOneCampaignPerPhone };
