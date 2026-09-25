# Agents Phone website

Public website source for `https://larsklander.com`, hosted on GitHub Pages from the `main` branch and repository root.

The Agents Phone privacy policy is at `agents-phone/privacy-policy.html`, published at `https://larsklander.com/agents-phone/privacy-policy.html`. The service information page is at `https://larsklander.com/agents-phone/`.

The Terms & Conditions page is at `https://larsklander.com/agents-phone/terms-and-conditions.html`. It includes an SMS Terms section at `#sms-terms`, program identity and description, affirmative text opt-in, frequency and rates disclosures, STOP and HELP instructions, customer care, carrier delivery limitations, and a Privacy Policy link.

Branded SMS short links: `https://larsklander.com/t` opens the Terms & Conditions, and `https://larsklander.com/p` opens the Privacy Policy. The static `t/index.html` and `p/index.html` pages use immediate HTML redirects with clickable fallbacks to the original policy pages. Keep those destinations stable. The welcome SMS in the opt-in sample uses these short links and stays below 320 characters; all sample SMS bodies use plain ASCII. Do not add smart quotes or other Unicode characters when copying them into Twilio.

The SMS opt-in sample is at `https://larsklander.com/agents-phone/opt-in.html`. It illustrates a START request, a welcome message with disclosures and legal links, a YES confirmation, and enrollment acknowledgment, plus HELP and STOP replies. The registered brand is `Lars Klander`. This page is a sample, not a working enrollment interface. Configure the Twilio/agent backend to implement the flow and retain consent records before using it with recipients. Receiving START alone must not trigger agent conversation or scheduling messages in this sample flow; wait for YES. Configure STOP handling independently of AI-generated responses.

The existing homepage, rental trackers, and relocation pages were copied from `larsklanderpe/family-trackers` to preserve their public URLs during the hosting move. That original repository remains intact. After the move, edits in this repository publish to the custom domain; edits in the original repository do not.

This is a static site. No build dependencies are required. GitHub Pages publishes updates pushed to `main`. Keep `CNAME` set to `larsklander.com` after the domain move, and keep HTTPS enforcement enabled in Settings > Pages.

Privacy text must describe the actual service, providers, data handling, consent, retention, and contact details. Update it when those practices change.

The Agents Phone pages document text opt-in, STOP and HELP, and agent-assisted conversations and scheduling. The messaging backend must implement those behaviors; those static pages do not collect consent, send messages, or handle opt-outs. The public privacy contact is `lars.klander@gmail.com`.

Twilio handles texts, and Grok Bot is the current AI agent. Other agent setups will use separate phone numbers and may include Claude, Codex, Cursor/SpaceX, Gemini, or other systems. Identify the active agent in each number's opt-in information and update the policy when providers change. Do not treat one number's opt-in as consent for another number. The policy does not make unverified claims about vendors' AI training policies.

## Work Notes enrollment

The separate Work Notes program uses the registered brand `Lars Klander Personal` and number `+15014644426`. Its pages are under `/work-notes/`. The enrollment page embeds the published Tally form `https://tally.so/r/MeB7DE`, with a direct link as a fallback. Tally stores the submissions; this repository has no enrollment backend.

The form requires name and email. SMS consent is a separate optional checkbox, unchecked by default. Selecting SMS consent conditionally requires the mobile number. An unchecked or absent consent value means no SMS consent, even if a phone number is present. Enrollment requires manual review by Lars. Outbound SMS, approval automation, and STOP/HELP handling are not implemented by this website or form.

Tally saves the submitted consent option text, submission timestamp, and calculated text field `consent_version`, currently `work-notes-sms-v1-2026-09-25`. Retain the applicable wording alongside each version when changing the form. Current consent text:

> I agree to receive automated SMS/text messages from Lars Klander Personal / Work Notes at the mobile number provided above, including work-request acknowledgments, clarification questions, and task updates. Message frequency varies. Message and data rates may apply. Reply STOP to unsubscribe or HELP for help. SMS consent is optional and is not a condition of purchase or access to the service.

Verified in the published form on September 25, 2026: selecting consent without a phone number is blocked; a submission without SMS consent or a phone number succeeds. One saved test record is named `TEST ONLY - no SMS - do not approve`, with email `work-notes-test@example.com`. It has no phone number or SMS consent and must not be approved. No real SMS opt-in or outbound SMS was tested.
