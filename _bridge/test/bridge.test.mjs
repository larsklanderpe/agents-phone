import test from 'node:test';
import assert from 'node:assert/strict';
import { Bridge } from '../src/bridge.mjs';

const config = {
  channel: 'Cdrive', team: 'Twork', app: 'Abridge', bot: 'Bbridge',
  number: '+15005550006', recipients: ['+12025550101'], users: ['Ulars'], bots: [],
  form: 'MeB7DE', consentVersion: 'v1', consentText: 'I agree to receive Work Notes SMS.',
  smsEnabled: false, a2pApproved: false, maxAgeSeconds: 300,
};
const submission = (id = 'form1', consent = true) => ({
  id, phone: '+12025550101', name: 'Test Person', email: 'test@example.com',
  consent, version: 'v1', consentText: config.consentText, submittedAt: Date.now(),
});
const inbound = (sid = 'SM1', body = 'Please investigate') => ({
  MessageSid: sid, From: '+12025550101', To: config.number, Body: body,
});
const reply = (id = 'Ev1', text = 'We are investigating') => ({
  type: 'event_callback', team_id: 'Twork', api_app_id: 'Abridge', event_id: id,
  event: { type: 'message', channel: 'Cdrive', user: 'Ulars', ts: String(Date.now() / 1000),
    thread_ts: '1800000000.000001', text },
});
function fixture(overrides = {}) {
  const sent = [], posted = [];
  const api = {
    async postSlack(p) { posted.push(p); return { ts: '1800000000.000001', channel: 'Cdrive' }; },
    async sendSms(p) { sent.push(p); return { sid: 'SMout1', status: 'queued' }; },
  };
  const bridge = new Bridge({ config: { ...config, ...overrides }, api, database: ':memory:' });
  return { bridge, api, sent, posted };
}

test('consent is recorded but cannot authorize SMS before explicit approval', () => {
  const { bridge } = fixture({ smsEnabled: true, a2pApproved: true });
  bridge.enroll(submission());
  assert.equal(bridge.permission('+12025550101').reason, 'not_approved');
  assert.throws(() => bridge.approve('form1', 'Ulars', '+12025550102'), /number/);
  bridge.approve('form1', 'Ulars', '+12025550101');
  assert.equal(bridge.permission('+12025550101').reason, 'welcome_required');
  bridge.close();
});

export { fixture, config, submission, inbound, reply };

async function ready(f) {
  const b = f.bridge;
  b.enroll(submission()); b.approve('form1', 'Ulars', '+12025550101');
  const id = b.queueWelcome('+12025550101');
  await b.workOne();
  assert.equal(b.permission('+12025550101').reason, 'welcome_required');
  b.status(id, { MessageSid: 'SMout1', From: config.number, To: '+12025550101', MessageStatus: 'delivered' });
  b.inbound(inbound()); await b.workOne();
  return b;
}

test('complete thread reply uses its saved recipient; provider receipt is not delivery', async () => {
  const f = fixture({ smsEnabled: true, a2pApproved: true }); const b = await ready(f);
  assert.equal(b.slack(reply()), 'queued'); await b.workOne();
  assert.equal(f.sent.length, 2); assert.equal(f.sent[1].phone, '+12025550101');
  assert.equal(f.sent[1].text, 'Work Notes: We are investigating');
  const job = Object.values(b.store.read().jobs).find(j => j.kind === 'reply');
  assert.equal(job.state, 'accepted');
  b.status(job.id, { MessageSid: 'SMout1', From: config.number, To: '+12025550101', MessageStatus: 'delivered' });
  assert.equal(b.store.read().jobs[job.id].state, 'delivered'); b.close();
});

test('no consent, wrong wording and mismatched number never authorize SMS', () => {
  const { bridge: b } = fixture({ smsEnabled: true, a2pApproved: true });
  b.enroll(submission('no', false));
  assert.throws(() => b.approve('no', 'Ulars', '+12025550101'), /affirmative/);
  assert.throws(() => b.enroll({ ...submission(), consentText: 'Something else' }), /invalid_consent/);
  assert.throws(() => b.queueWelcome('+12025550101'), /not_approved/); b.close();
});

test('STOP cancels a queued reply; START cannot restore consent', async () => {
  const f = fixture({ smsEnabled: true, a2pApproved: true }); const b = await ready(f);
  b.slack(reply()); b.inbound(inbound('SMstop', ' stop '));
  await b.workOne();
  assert.equal(f.sent.length, 1); assert.equal(b.permission('+12025550101').reason, 'unsubscribed');
  b.inbound(inbound('SMstart', 'START'));
  assert.equal(b.permission('+12025550101').reason, 'unsubscribed');
  assert.throws(() => b.approve('form1', 'Ulars', '+12025550101'), /fresh_consent/); b.close();
});

test('HELP and control words never become tickets or duplicate SMS responses', async () => {
  const f = fixture();
  for (const [i, word] of ['HELP', 'INFO', 'START', 'UNSTOP', 'STOP', 'QUIT', 'OPTOUT', 'END'].entries()) f.bridge.inbound(inbound(`SM${i}`, word));
  await f.bridge.workOne(); assert.equal(f.sent.length, 0); assert.equal(f.posted.length, 0); f.bridge.close();
});

test('wrong channel, user, bot, top-level, edits and unmapped threads cannot send', async () => {
  const f = fixture({ smsEnabled: true, a2pApproved: true }); const b = await ready(f);
  for (const patch of [{ channel: 'Cother' }, { user: 'Uother' }, { bot_id: 'Bbridge' }, { thread_ts: undefined }, { subtype: 'message_changed' }, { thread_ts: 'unknown' }]) {
    const p = reply(); Object.assign(p.event, patch); assert.notEqual(b.slack(p), 'queued');
  }
  assert.equal(b.slack({ ...reply(), team_id: 'Tother' }), 'ignored');
  assert.equal(b.slack(reply('internal', 'INTERNAL: keep private')), 'internal');
  assert.equal(f.sent.length, 1); b.close();
});

test('Twilio and Slack retries are deduplicated including different event IDs', async () => {
  const f = fixture({ smsEnabled: true, a2pApproved: true }); const b = await ready(f);
  assert.equal(b.inbound(inbound()), 'duplicate');
  const p = reply(); assert.equal(b.slack(p), 'queued');
  assert.equal(b.slack(p), 'duplicate');
  assert.equal(b.slack({ ...p, event_id: 'different-envelope' }), 'duplicate');
  await b.workOne(); assert.equal(f.sent.length, 2); b.close();
});

test('disabled replies do not build a backlog when sending is later enabled', async () => {
  const f = fixture(); const b = f.bridge;
  b.inbound(inbound()); await b.workOne();
  assert.equal(b.slack(reply()), 'sending_disabled');
  b.config.smsEnabled = true; b.config.a2pApproved = true;
  await b.workOne(); assert.equal(f.sent.length, 0); b.close();
});

test('send gate is checked again at dispatch and queued replies expire', async () => {
  for (const mode of ['disabled', 'expired']) {
    const f = fixture({ smsEnabled: true, a2pApproved: true }); const b = await ready(f);
    b.slack(reply());
    if (mode === 'disabled') b.config.smsEnabled = false;
    else b.store.change(s => { Object.values(s.jobs).find(j => j.kind === 'reply').createdAt = 1; });
    await b.workOne(); assert.equal(f.sent.length, 1); b.close();
  }
});

test('uncertain SMS send is not automatically retried', async () => {
  const f = fixture({ smsEnabled: true, a2pApproved: true }); const b = await ready(f);
  let calls = 0; f.api.sendSms = async () => { calls++; throw new Error('timeout'); };
  b.slack(reply()); await b.workOne(); await b.workOne(); await b.workOne();
  assert.equal(calls, 1);
  assert.equal(Object.values(b.store.read().jobs).find(j => j.kind === 'reply').state, 'uncertain'); b.close();
});

test('callback validates recipient and cannot regress delivered to sent', async () => {
  const f = fixture({ smsEnabled: true, a2pApproved: true }); const b = await ready(f);
  b.slack(reply()); await b.workOne();
  const job = Object.values(b.store.read().jobs).find(j => j.kind === 'reply');
  const p = { MessageSid: 'SMout1', From: config.number, To: '+12025550101', MessageStatus: 'delivered' };
  assert.equal(b.status(job.id, { ...p, To: '+12025550102' }), 'ignored');
  b.status(job.id, p); b.status(job.id, { ...p, MessageStatus: 'sent' });
  assert.equal(b.store.read().jobs[job.id].state, 'delivered'); b.close();
});

test('late welcome delivery after STOP does not re-enable the subscriber', async () => {
  const f = fixture({ smsEnabled: true, a2pApproved: true }); const b = f.bridge;
  b.enroll(submission()); b.approve('form1', 'Ulars', '+12025550101');
  const id = b.queueWelcome('+12025550101'); await b.workOne();
  b.inbound(inbound('SMstop', 'STOP'));
  b.status(id, { MessageSid: 'SMout1', From: config.number, To: '+12025550101', MessageStatus: 'delivered' });
  assert.equal(b.permission('+12025550101').reason, 'unsubscribed');
  assert.equal(b.store.read().preferences['+12025550101'].welcomedAt, null); b.close();
});

test('two phones keep separate thread recipients even when reply text mentions another number', async () => {
  const second = '+12025550102';
  const f = fixture({ smsEnabled: true, a2pApproved: true, recipients: ['+12025550101', second] });
  const b = await ready(f);
  b.enroll({ ...submission('form2'), phone: second }); b.approve('form2', 'Ulars', second);
  const welcome = b.queueWelcome(second); await b.workOne();
  b.status(welcome, { MessageSid: 'SMout1', From: config.number, To: second, MessageStatus: 'delivered' });
  f.api.postSlack = async () => ({ ts: '1800000002.000001', channel: 'Cdrive' });
  b.inbound({ ...inbound('SMtwo'), From: second }); await b.workOne();
  const p = reply('Esecond', 'Call +12025550101 about this'); p.event.thread_ts = '1800000002.000001';
  assert.equal(b.slack(p), 'queued'); await b.workOne();
  assert.equal(f.sent.at(-1).phone, second);
  assert.equal(b.store.read().threads['1800000000.000001'].phone, '+12025550101'); b.close();
});

test('delivery callback arriving before the send response is preserved', async () => {
  const f = fixture({ smsEnabled: true, a2pApproved: true }); const b = await ready(f);
  f.api.sendSms = async ({ id, phone }) => {
    b.status(id, { MessageSid: 'SMrace', From: config.number, To: phone, MessageStatus: 'delivered' });
    return { sid: 'SMrace', status: 'queued' };
  };
  b.slack(reply()); await b.workOne();
  assert.equal(Object.values(b.store.read().jobs).find(j => j.kind === 'reply').state, 'delivered'); b.close();
});
