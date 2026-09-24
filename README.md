# Agents Phone website

Public website source for `https://larsklander.com`, hosted on GitHub Pages from the `main` branch and repository root.

The Agents Phone privacy policy is at `agents-phone/privacy-policy.html`, published at `https://larsklander.com/agents-phone/privacy-policy.html`. The service information page is at `https://larsklander.com/agents-phone/`.

The Terms & Conditions page is at `https://larsklander.com/agents-phone/terms-and-conditions.html`. It includes an SMS Terms section at `#sms-terms`, program identity and description, affirmative text opt-in, frequency and rates disclosures, STOP and HELP instructions, customer care, carrier delivery limitations, and a Privacy Policy link.

The SMS opt-in sample is at `https://larsklander.com/agents-phone/opt-in.html`. It illustrates a START request, a welcome message with disclosures and legal links, a YES confirmation, and enrollment acknowledgment, plus HELP and STOP replies. The registered brand is `Lars Klander`. This page is a sample, not a working enrollment interface. Configure the Twilio/agent backend to implement the flow and retain consent records before using it with recipients. Receiving START alone must not trigger agent conversation or scheduling messages in this sample flow; wait for YES. Configure STOP handling independently of AI-generated responses.

The existing homepage, rental trackers, and relocation pages were copied from `larsklanderpe/family-trackers` to preserve their public URLs during the hosting move. That original repository remains intact. After the move, edits in this repository publish to the custom domain; edits in the original repository do not.

This is a static site. No build dependencies are required. GitHub Pages publishes updates pushed to `main`. Keep `CNAME` set to `larsklander.com` after the domain move, and keep HTTPS enforcement enabled in Settings > Pages.

Privacy text must describe the actual service, providers, data handling, consent, retention, and contact details. Update it when those practices change.

These pages document text opt-in, STOP and HELP, and agent-assisted conversations and scheduling. The messaging backend must implement those behaviors; this static repository does not collect consent, send messages, or handle opt-outs. The public privacy contact is `lars.klander@gmail.com`.

Twilio handles texts, and Grok Bot is the current AI agent. Other agent setups will use separate phone numbers and may include Claude, Codex, Cursor/SpaceX, Gemini, or other systems. Identify the active agent in each number's opt-in information and update the policy when providers change. Do not treat one number's opt-in as consent for another number. The policy does not make unverified claims about vendors' AI training policies.
