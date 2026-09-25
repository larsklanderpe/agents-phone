# Session notes

## 2026-09-25: Live deployment and Slack preflight correction

- CURRENT BRANCH: codex/work-notes-preflight-fix, isolated worktree from merged main 8e0266c.
- OPEN PRs: preparing the preflight correction; PR #3 merged and its worktree/branch cleaned up.
- EXTERNAL DEPENDENCIES: Slack private-channel bot membership and event verification; signed Tally field mapping; Twilio campaign verification and controlled handset acceptance.
- Render is deployed with a persistent disk and all three signing/auth secrets configured privately. Both SMS send switches remain false. The initial missing-secret startup failure is resolved; the deployed build passed 23 tests.
- Lars approved the three additional bot scopes and reinstallation. Reinstalled Work Notes with cos-drive selected for the webhook. The actual bot OAuth token matches the Work Notes app; corrected its configured bot identity using auth.test. Revealed existing Render fields before editing because edits while masked were not persisted. Corrected the public base URL to the assigned Render origin.
- Live preflight then exposed a request-format bug: conversations.info with a JSON POST returned invalid_arguments and missing required field: channel. A GET with the channel query parameter reached the channel lookup. Changed this read to GET, retaining JSON POST for message writes; the strengthened preflight test failed before the fix and all 23 tests pass after it.
- Bot conversations.list currently returns no private channels. The bot still needs actual cos-drive membership; the incoming webhook channel selection is not membership evidence. No Slack events enabled and no new inbound cutover yet.
- Tally webhook is connected. Submitted one clearly labeled fictitious no-SMS enrollment; its first delivery received 502 during a Render restart. Signed schema and successful ingestion remain unverified. No real recipient consent approved and no SMS sent.
- An automatic approval review blocked enabling Slack events while preflight reported wrong_slack_installation. Resolve all identity/membership checks before retrying, rather than bypassing the block.

## 2026-09-25: Work Notes two-way bridge implementation

- CURRENT BRANCH: codex/work-notes-return-path, isolated worktree based on published main 5825642.
- OPEN PRs: [bridge PR #3](https://github.com/larsklanderpe/agents-phone/pull/3), awaiting owner review and merge approval; previous policy and enrollment PRs #1 and #2 are merged.
- EXTERNAL DEPENDENCIES: Render account/billing and deployment, Slack app permission approval/reinstall, provider secrets, live signed Tally field mapping, Twilio A2P approval, and an authorized handset acceptance test.
- Implemented signed Tally, Slack and Twilio endpoints; pending enrollment/manual approval; STOP suppression; explicit welcome; trusted thread-to-phone mapping; durable jobs/deduplication; status callbacks and private owner CLI.
- Sending defaults off. All 23 local tests pass, covering simulated sending, no-consent and unapproved blocking, opt-out, routing, signatures, retry deduplication, delivery status, timeouts and restart recovery. No live Slack messages or SMS were sent by this implementation.
- Prepared a one-instance Render blueprint with persistent disk and a deployment/rollback runbook. Proposed hosting cost is approximately USD 7.25/month before Twilio and any excess usage. Lars has no host account yet and asked whether GitHub could run the bridge; explained static Pages versus Render runtime.
- Read-only inspection confirms Work Notes Slack app has only incoming-webhook scope. Additional bot scopes and reinstallation are still required. No tokens are committed or included in these notes.
- Prior live setup: Twilio Advanced Opt-Out enabled with branded STOP/START/HELP responses; Studio revision 16 published with control-keyword filtering before the existing sender allowlist. Existing inbound Studio routing remains unchanged by this implementation.
- Added a proposed Render hosting disclosure to the Work Notes privacy policy. It is not published until the branch is approved and merged.
- Next: owner review/merge, create Render account, deploy with sending disabled, connect and verify callbacks, confirm A2P, approve real consent, then perform a separately authorized end-to-end SMS test. The code is prepared, not live-verified.

## 2026-09-25: Work Notes Tally enrollment

- CURRENT BRANCH: feat/work-notes-enrollment
- OPEN PRs: pending creation for Tally embed and policy updates.
- EXTERNAL DEPENDENCIES: Tally hosts the live form; GitHub Pages publishes after merge; Twilio A2P review and outbound implementation remain pending.
- Corrected and published the Tally SMS consent field as optional. Verified that choosing consent requires a phone number and that no-SMS enrollment succeeds without a phone number.
- Confirmed the saved no-SMS test record, submission timestamp, and consent_version in Tally. One clearly labeled test record remains; no real recipient enrolled.
- Added the Tally embed and direct fallback link under /work-notes/, updated policies to describe collection through Tally, and documented manual approval and remaining messaging work.
- Next: merge and verify the public website; configure and verify approval, STOP/HELP, and outbound behavior before enabling program messages.

## 2026-09-25: Work Notes policy publication

- CURRENT BRANCH: docs/work-notes-policies
- OPEN PRs: PR #1 merged as 55d7191; policy pages verified live.
- EXTERNAL DEPENDENCIES: GitHub Pages; Twilio A2P campaign review. Enrollment and outbound messaging remain unimplemented.
- Added Work Notes information, privacy, and SMS terms pages for Lars Klander Personal and +15014644426.
- Kept Agents Phone policies and branded redirects unchanged.
- Explicitly disclosed that enrollment and outbound replies are not live; these pages are not CTA evidence of a working form.
- Next: implement and verify affirmative consent capture, approval, opt-out handling, and outbound replies before resubmitting the campaign.
