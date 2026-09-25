# Session notes

## 2026-09-25: Work Notes two-way bridge implementation

- CURRENT BRANCH: codex/work-notes-return-path, isolated worktree based on published main 5825642.
- OPEN PRs: bridge PR pending creation; previous policy and enrollment PRs #1 and #2 are merged.
- EXTERNAL DEPENDENCIES: Render account/billing and deployment, Slack app permission approval/reinstall, provider secrets, live signed Tally field mapping, Twilio A2P approval, and an authorized handset acceptance test.
- Implemented signed Tally, Slack and Twilio endpoints; pending enrollment/manual approval; STOP suppression; explicit welcome; trusted thread-to-phone mapping; durable jobs/deduplication; status callbacks and private owner CLI.
- Sending defaults off. Verified simulated sending, no-consent and unapproved blocking, opt-out, routing, signatures, retry deduplication, delivery status, timeouts and restart recovery with local tests. No live Slack messages or SMS were sent by this implementation.
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
