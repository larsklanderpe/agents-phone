import test from 'node:test';
import assert from 'node:assert/strict';
import { transport } from '../src/transport.mjs';
import { loadConfig } from '../src/config.mjs';

const c = { account: 'ACtest', twilioToken: 'secret', service: 'MGtest', number: '+15005550006',
  origin: 'https://bridge.example.com', channel: 'Cdrive', team: 'Twork', bot: 'Bbridge',
  slackToken: 'test', smsEnabled: true, a2pApproved: true };

test('outbound transport pins sender/service/callback and validates the provider receipt', async () => {
  let captured;
  const api = transport(c, async (url, options) => {
    captured = { url, options };
    return Response.json({ sid: 'SM1', status: 'queued', from: c.number, to: '+12025550101', messaging_service_sid: c.service, account_sid: c.account });
  });
  await api.sendSms({ phone: '+12025550101', text: 'Hello', id: 'job' });
  const p = new URLSearchParams(captured.options.body);
  assert.equal(p.get('From'), c.number); assert.equal(p.get('MessagingServiceSid'), c.service);
  assert.equal(p.get('StatusCallback'), c.origin + '/twilio/status/job');
  assert.equal(captured.options.redirect, 'error');
  const wrong = transport(c, async () => Response.json({ sid: 'SM1', status: 'queued', to: '+12025550102' }));
  await assert.rejects(wrong.sendSms({ phone: '+12025550101', text: 'Hello', id: 'job' }), e => !e.definite);
});

test('provider timeout and 5xx are uncertain; explicit rejection is definite', async () => {
  for (const [status, definite] of [[400, true], [429, true], [500, false]]) {
    const api = transport(c, async () => Response.json({ code: 21610 }, { status }));
    await assert.rejects(api.sendSms({ phone: '+12025550101', text: 'Hi', id: 'job' }), e => e.definite === definite);
  }
  const api = transport(c, async () => { throw new Error('timeout'); });
  await assert.rejects(api.sendSms({ phone: '+12025550101', text: 'Hi', id: 'job' }), e => !e.definite);
});

test('preflight rejects unapproved campaign or wrong Slack installation and sends no messages', async () => {
  let approved = true, wrongTeam = false;
  const api = transport(c, async (url, options) => {
    assert.equal(url.includes('/Messages.json'), false);
    if (url.endsWith('auth.test')) return Response.json({ ok: true, team_id: wrongTeam ? 'other' : c.team, bot_id: c.bot });
    if (url.endsWith('conversations.info')) return Response.json({ ok: true, channel: { is_private: true, is_member: true } });
    if (url.endsWith('/PhoneNumbers')) return Response.json({ phone_numbers: [{ phone_number: c.number }] });
    if (url.endsWith('/Usa2p')) return Response.json({ compliance: [{ campaign_status: approved ? 'VERIFIED' : 'IN_PROGRESS', messaging_service_sid: c.service, mock: false }] });
    assert.equal(options.method, undefined);
    return Response.json({ account_sid: c.account });
  });
  assert.equal((await api.preflight()).campaignVerified, true);
  approved = false; await assert.rejects(api.preflight(), /not_verified/);
  wrongTeam = true; await assert.rejects(api.preflight(), /wrong_slack/);
});

test('configuration fails closed with missing credentials or invalid send switches', () => {
  assert.throws(() => loadConfig({}), /missing/);
  const env = {
    PUBLIC_BASE_URL: 'https://example.com', DATABASE_PATH: '/private/data.sqlite',
    SLACK_CHANNEL_ID: 'C1', SLACK_TEAM_ID: 'T1', SLACK_APP_ID: 'A1', SLACK_BOT_ID: 'B1', SLACK_ALLOWED_USER_IDS: 'U1',
    SLACK_BOT_TOKEN: 'test', SLACK_SIGNING_SECRET: 'test', TWILIO_ACCOUNT_SID: 'AC' + 'a'.repeat(32), TWILIO_AUTH_TOKEN: 'test',
    TWILIO_MESSAGING_SERVICE_SID: 'MG' + 'a'.repeat(32), TWILIO_NUMBER: '+15005550006', ALLOWED_PHONE_NUMBERS: '+12025550101',
    TALLY_FORM_ID: 'form', TALLY_SIGNING_SECRET: 'test',
  };
  assert.equal(loadConfig(env).smsEnabled, false); assert.equal(loadConfig(env).a2pApproved, false);
  assert.throws(() => loadConfig({ ...env, SMS_ENABLED: 'yes' }), /invalid/);
  assert.throws(() => loadConfig({ ...env, PUBLIC_BASE_URL: 'http://example.com' }), /https/);
  assert.throws(() => loadConfig({ ...env, DATABASE_PATH: ':memory:' }), /persistent/);
});
