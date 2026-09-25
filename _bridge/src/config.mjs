import { CONSENT_TEXT, CONSENT_VERSION } from './bridge.mjs';

export function loadConfig(env = process.env) {
  const required = key => { if (!env[key]?.trim()) throw new Error(`missing:${key}`); return env[key].trim(); };
  const list = key => required(key).split(',').map(v => v.trim()).filter(Boolean);
  const flag = key => {
    if (env[key] && !['true', 'false'].includes(env[key])) throw new Error(`invalid:${key}`);
    return env[key] === 'true';
  };
  const origin = new URL(required('PUBLIC_BASE_URL'));
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new Error('PUBLIC_BASE_URL_must_be_https_origin');
  const c = {
    origin: origin.origin, database: required('DATABASE_PATH'), port: Number(env.PORT || 3000),
    channel: required('SLACK_CHANNEL_ID'), team: required('SLACK_TEAM_ID'), app: required('SLACK_APP_ID'),
    bot: required('SLACK_BOT_ID'), users: list('SLACK_ALLOWED_USER_IDS'),
    slackToken: required('SLACK_BOT_TOKEN'), slackSecret: required('SLACK_SIGNING_SECRET'),
    account: required('TWILIO_ACCOUNT_SID'), twilioToken: required('TWILIO_AUTH_TOKEN'),
    service: required('TWILIO_MESSAGING_SERVICE_SID'), number: required('TWILIO_NUMBER'),
    recipients: list('ALLOWED_PHONE_NUMBERS'), form: required('TALLY_FORM_ID'),
    tallySecret: required('TALLY_SIGNING_SECRET'), tallyFields: JSON.parse(env.TALLY_FIELD_KEYS || '{}'),
    smsEnabled: flag('SMS_ENABLED'), a2pApproved: flag('A2P_APPROVED'), maxAgeSeconds: 300,
    consentVersion: CONSENT_VERSION, consentText: CONSENT_TEXT,
  };
  if (c.database === ':memory:') throw new Error('persistent_database_required');
  if (![c.number, ...c.recipients].every(n => /^\+[1-9]\d{7,14}$/.test(n))) throw new Error('E164_phone_numbers_required');
  if (!Number.isInteger(c.port) || c.port < 1 || c.port > 65535) throw new Error('invalid_PORT');
  for (const [key, prefix] of [['account', 'AC'], ['service', 'MG']]) if (!new RegExp(`^${prefix}[a-f0-9]{32}$`, 'i').test(c[key])) throw new Error(`invalid:${key}`);
  return c;
}
