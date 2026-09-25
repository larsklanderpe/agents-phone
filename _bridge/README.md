# Work Notes bridge

An always-on Node 24 service for private, low-volume SMS work requests. Incoming texts become Slack roots. Authorized replies inside those roots return to the original phone after consent, manual approval and a delivered enrollment confirmation. No public admin endpoint exists.

**Status: implementation prepared, not deployed or tested against live provider callbacks.** Keep both send switches false until the deployment acceptance checks pass. Existing Studio routing continues until an intentional cutover.

## Hosting

GitHub stores source and hosts static policy pages. Render runs this service and stores the private SQLite database on a persistent disk. The proposed `0.5c-512mb` service (formerly Starter) plus 1 GB disk costs about USD 7.25/month at September 25, 2026 prices, excluding Twilio, taxes and any excess usage. Free Render services do not provide the persistent disk needed here.

Use one instance only. Deploys with an attached disk briefly interrupt service; provider retries and durable deduplication handle repeat callbacks. This service favors avoiding duplicate sends over automatic retries after uncertain results. It is not intended for bulk messaging.

## Run the local tests

Install Node 24.14.1 or a later Node 24 patch. No package installation or credentials are needed.

```sh
cd _bridge
npm test
```

Tests use fictitious phone numbers, in-memory databases and ignored `.test-data` files. They never call Slack or Twilio. The native SQLite experimental warning on Node 24 is expected.

## Deploy while SMS remains disabled

1. Sign in to Render using GitHub. Select the personal workspace and authorize access only to this repository. Add billing after reviewing the service cost.
2. Create a Blueprint from the reviewed repository branch. Set the Blueprint path to `_bridge/render.yaml`. Review the paid `0.5c-512mb` instance and 1 GB persistent disk before creating them. Automatic deploys are disabled.
3. Set `PUBLIC_BASE_URL` to the actual assigned HTTPS service origin, with no path, query or credentials. If the final URL is not available during creation, use an HTTPS placeholder, then correct it before connecting callbacks.
4. Populate the environment values below directly in Render. Never paste tokens into GitHub, a form response, Slack, a ticket or source code. Retain `SMS_ENABLED=false` and `A2P_APPROVED=false`.
5. Confirm `/healthz` returns `ok`. Health only proves the process is running. It does not prove provider integration or delivery.
6. Follow the Slack, Tally and Twilio setup below. Run `npm run admin -- preflight` in the Render service Shell. It reads provider state and sends no messages.

Use the service Shell, not a one-off job: only the service has access to its disk. Commands run from `_bridge`, the configured service root. Database content, backups and shell output containing enrollments are private.

### Environment values

| Variable | Value |
| --- | --- |
| `DATABASE_PATH` | `/var/data/work-notes.sqlite`, supplied by blueprint |
| `PUBLIC_BASE_URL` | Actual Render HTTPS origin |
| `SLACK_TEAM_ID`, `SLACK_APP_ID`, `SLACK_BOT_ID` | Existing Work Notes installation identifiers |
| `SLACK_CHANNEL_ID` | ID of the private `cos-drive` channel |
| `SLACK_ALLOWED_USER_IDS` | Lars's verified Slack user ID only, initially |
| `SLACK_BOT_TOKEN` | Bot OAuth token from that installation |
| `SLACK_SIGNING_SECRET` | Signing secret from the same app's Basic Information |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Work Notes account and primary auth token; not the separate Agents Phone account |
| `TWILIO_MESSAGING_SERVICE_SID` | Service containing the Work Notes number and campaign |
| `TWILIO_NUMBER` | `+15014644426` |
| `ALLOWED_PHONE_NUMBERS` | Comma-separated owner-approved E.164 numbers, configured privately |
| `TALLY_FORM_ID` | `MeB7DE` |
| `TALLY_SIGNING_SECRET` | New webhook signing secret set identically in Tally and Render |
| `TALLY_FIELD_KEYS` | Exact field and option IDs obtained through the signed schema check below |
| `SMS_ENABLED`, `A2P_APPROVED` | Literal `false` initially; both must become `true` at the authorized activation step |

### Slack

Use the existing Work Notes app. The example manifest describes the needed settings but must not overwrite unrelated existing app settings blindly. Keep the existing incoming webhook during migration.

- Add bot scopes `chat:write`, `groups:history` and `groups:read`; preserve `incoming-webhook`. No user-token scopes are needed. These permissions apply to private channels the app joins, so keep its membership limited to `cos-drive`.
- Lars approves the permissions and reinstalls the app. Put the resulting bot token and app signing secret directly in Render.
- Enable Event Subscriptions with `https://YOUR-SERVICE/slack/events`; the signed URL challenge should pass. Subscribe the bot to `message.groups`. Confirm Work Notes is a member of `cos-drive`.
- Only ordinary thread messages from the configured user IDs are forwarded. Top-level messages, edits, files, bot messages and unknown threads are ignored or rejected. Cursor currently posts as Lars, so its messages must use the mapped SMS thread to return to the phone.
- Prefix a thread reply with `INTERNAL:` to keep it inside Slack. Messages over 1,500 characters or containing attachments are rejected with a thread notice. Delivery receipts posted by Work Notes do not loop back to SMS.

### Tally

Keep the separate unchecked SMS consent checkbox and optional number unless consent is checked. Do not change the live consent wording without a new version and corresponding application update.

1. In form Integrations, add webhook `https://YOUR-SERVICE/tally/enrollment` and a signing secret. Configure the same secret in Render.
2. With SMS disabled, submit a clearly labeled test enrollment without SMS consent. The initial webhook receives 503 until mapping is configured; this intentionally asks Tally to retry rather than discard the response.
3. Run `npm run admin -- schema`. This displays signed field metadata, not respondent values. Identify the name, email, phone, checkbox, calculated version field and consent option IDs.
4. Set `TALLY_FIELD_KEYS` to JSON using those exact IDs, for example:

```json
{"name":"question_NAME","email":"question_EMAIL","phone":"question_PHONE","consent":"question_CONSENT","consentOption":"OPTION_ID","version":"calculated_VERSION"}
```

5. Redeploy and retry that webhook in Tally. Verify a 200 response and the no-SMS record with `npm run admin -- enrollments`. Confirm the checkbox field type is `CHECKBOXES`, phone is `INPUT_PHONE_NUMBER`, and version is `CALCULATED_FIELDS`. A differing payload shape requires an adapter update and test before activation.
6. After a real owner-authorized opt-in, verify the signed stored text/version, submission time and phone. Independently verify control of the number before approving. The form itself does not prove number ownership.

Approval records consent without sending:

```sh
npm run admin -- approve SUBMISSION_ID OWNER_SLACK_ID +12025550101
```

No-SMS submissions cannot be approved. An inbound allowlist entry alone never grants outbound consent. START and UNSTOP lift the provider block only; after STOP, a fresh consent submission and approval are required.

### Twilio cutover

Preserve the existing Studio flow as the rollback path. The live flow already filters control keywords before forwarding approved senders. The service currently defers inbound handling to the sender's webhook.

1. Verify Advanced Opt-Out is enabled on the Work Notes Messaging Service and retains the configured STOP, START/UNSTOP and HELP/INFO responses. Twilio sends those control responses; this bridge sends empty TwiML to avoid duplicate responses.
2. After the new service and Slack checks pass, change only the Work Notes number's incoming-message webhook to `https://YOUR-SERVICE/twilio/inbound`, HTTP POST. Do not route through the old Studio HTTP widget: the bridge expects Twilio's original signed request, not reconstructed fields. Leave service inbound handling set to defer to sender.
3. Use an approved sender to send one explicitly authorized test text. Confirm one Slack root and a stored sender/thread mapping. Verify a Slack reply while disabled produces a not-sent note. Old Studio-created roots are not mapped and will not send SMS.
4. Confirm the number's A2P campaign is verified. The service startup preflight rechecks provider campaign state when `SMS_ENABLED=true`. The `A2P_APPROVED` flag alone is insufficient.

## Activation and acceptance

Do not enable sends merely because code tests pass. First verify the live signed callbacks and identity mapping, receive campaign approval, publish the hosting disclosure, approve a genuine consent record, and obtain the owner's approval for the controlled SMS test.

1. Set both send switches true and redeploy. Verify preflight success. Any failure leaves the enabled process unavailable rather than allowing unverified sends.
2. Explicitly queue one welcome for the enrolled phone:

```sh
npm run admin -- welcome +12025550101
```

3. Confirm its `delivered` callback in `npm run admin -- jobs` and receipt on the handset. Until then, ordinary replies remain blocked. If callbacks are missing, reconcile the provider message by its SID; never resend blindly.
4. Send a fresh inbound test text and reply inside that Slack root. Confirm the right phone receives it and Slack shows delivered. Verify a different Slack user and top-level message cannot send.
5. Test HELP, STOP and a blocked post-STOP reply. Verify exactly one provider control response, no ticket for the control keyword, and no program reply after STOP. START alone must leave replies blocked. A new form consent and approval are needed to re-enroll.
6. Repeat routing with another approved handset before general use. The Australian number also depends on Twilio destination permissions and carrier delivery; A2P approval alone does not verify that route.

## Operations and recovery

```sh
npm run admin -- jobs
npm run admin -- audit
npm run admin -- revoke +12025550101 OWNER_SLACK_ID
npm run admin -- reconcile JOB_ID MESSAGE_SID
npm run admin -- backup /var/data/PRIVATE-NEW-BACKUP.sqlite
```

`accepted` means Twilio returned a validated message SID, not handset delivery. Status callbacks or a read-back mark delivered/failed. In-flight requests interrupted by a restart become uncertain. They are never retried automatically. For an uncertain SMS, inspect Twilio's message log and reconcile the matching SID; the CLI verifies body, sender, recipient, service and attempt time. A failed welcome needs a new reviewed enrollment or an implementation change to allow a deliberate retry; do not edit the database to bypass it.

For an uncertain inbound Slack post, inspect the channel and private job data before deciding what to do. This first version deliberately provides no automatic repost or recipient-mapping override. A new handset message creates a new mapped root. Record any lost or uncertain work manually.

The worker checks consent and send switches again immediately before dispatch. STOP cannot recall a message already handed to the provider. Queued SMS expires after five minutes. Replies received while disabled are rejected and never replay automatically when enabled.

Use the SQLite backup command before deployments that change storage. Download backups to approved private storage; do not commit them or put them under the website. Render disk snapshots are not a substitute for a verified SQLite backup. Test a restore privately with both send switches false and no live callback routing before using it for recovery. Restore can resurrect old approval records, so re-check current suppression and provider logs before enabling sends.

Monitor Render errors and private job status. HTTP health does not detect provider delivery failures. This initial single-instance store keeps all consent, audit, message and deduplication records; at this private volume, review size and retention monthly. Implement archival/retention before expanding usage. No database or logs are served through HTTP. Source lives in a public Pages repository with `.nojekyll`, so source and these instructions can be publicly retrieved after merge; only placeholders and public program details belong here.

### Rollback

Set `SMS_ENABLED=false` and redeploy first. Restore the number's previous Studio flow (`Work Notes - SMS to Slack`) for incoming messages. Disable the Slack event subscription. Keep Advanced Opt-Out and consent/suppression records. Do not restore an old database merely to roll back code. Keep Tally pointed at a functioning receiver or pause enrollment with a clear notice if the receiver is unavailable.

## References

- [Slack signed requests](https://docs.slack.dev/authentication/verifying-requests-from-slack/)
- [Twilio webhook validation](https://www.twilio.com/docs/usage/security)
- [Twilio campaign status](https://www.twilio.com/docs/messaging/api/usapptoperson-resource)
- [Twilio Advanced Opt-Out](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out)
- [Tally webhooks](https://tally.so/help/webhooks)
- [Render disks](https://render.com/docs/disks) and [pricing](https://render.com/pricing)
