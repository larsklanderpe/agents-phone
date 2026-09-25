# Session notes

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
