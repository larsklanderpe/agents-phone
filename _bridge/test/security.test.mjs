import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { slackSignature, twilioSignature, tallySignature, tallyEnrollment, formBody } from '../src/security.mjs';
import { server } from '../src/http.mjs';
import { Bridge } from '../src/bridge.mjs';
import { Store } from '../src/store.mjs';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

test('Slack signature uses raw bytes and rejects stale timestamps and tampering', () => {
  const body = Buffer.from('{ "text": "a" }'), timestamp = String(Math.floor(Date.now() / 1000));
  const sig = 'v0=' + createHmac('sha256', 'secret').update(`v0:${timestamp}:`).update(body).digest('hex');
  assert.equal(slackSignature('secret', timestamp, body, sig), true);
  assert.equal(slackSignature('secret', timestamp, Buffer.from('{"text":"a"}'), sig), false);
  assert.equal(slackSignature('secret', timestamp, body, sig, Date.now() + 301000), false);
  assert.equal(slackSignature('secret', timestamp, body, 'bad'), false);
});

test('Twilio validates official documented signature fixture and complete public URL', () => {
  const params = { CallSid: 'CA1234567890ABCDE', Caller: '+14158675310', Digits: '1234', From: '+14158675310', To: '+18005551212' };
  const url = 'https://example.com/myapp.php?foo=1&bar=2';
  // Fixed example from Twilio's request validation documentation.
  assert.equal(twilioSignature('12345', url, params, 'L/OH5YylLD5NRKLltdqwSvS0BnU='), true);
  assert.equal(twilioSignature('12345', url.replace('https:', 'http:'), params, 'L/OH5YylLD5NRKLltdqwSvS0BnU='), false);
  assert.throws(() => formBody(Buffer.from('To=a&To=b')), /duplicate/);
});

const cfg = {
  form: 'form', consentVersion: 'v1', consentText: 'I agree to SMS.',
  tallyFields: { consent: 'c', consentOption: 'yes', name: 'n', phone: 'p', email: 'e', version: 'v' },
};
function payload(consent = false) {
  return { eventType: 'FORM_RESPONSE', data: { formId: 'form', submissionId: 'sub1', createdAt: new Date().toISOString(), fields: [
    { key: 'c', type: 'CHECKBOXES', value: consent ? ['yes'] : [], options: [{ id: 'yes', text: cfg.consentText }] },
    { key: 'p', type: 'INPUT_PHONE_NUMBER', value: consent ? '+12025550101' : null },
    { key: 'n', type: 'INPUT_TEXT', value: 'Test' }, { key: 'e', type: 'INPUT_EMAIL', value: 'test@example.com' },
    { key: 'v', type: 'CALCULATED_FIELDS', value: 'v1' },
  ] } };
}

test('Tally signature and exact option selection distinguish consent from no-SMS enrollment', () => {
  const p = payload();
  const sig = createHmac('sha256', 'secret').update(JSON.stringify(p)).digest('base64');
  assert.equal(tallySignature('secret', p, sig), true);
  assert.equal(tallyEnrollment(p, cfg).consent, false);
  assert.equal(tallyEnrollment(payload(true), cfg).consent, true);
  p.data.fields[0].value = ['yes'];
  assert.equal(tallySignature('secret', p, sig), false);
  p.data.fields[0].options[0].text = 'A different program';
  assert.throws(() => tallyEnrollment(p, cfg), /mismatch/);
  assert.throws(() => tallyEnrollment(payload(), { ...cfg, tallyFields: {} }), /mapping/);
});

test('HTTP endpoints reject unsigned requests and accept a signed Slack challenge', async t => {
  const c = { ...cfg, slackSecret: 'secret', tallySecret: 'tally', twilioToken: 'twilio', account: 'account', origin: 'https://example.com' };
  const b = new Bridge({ config: c, api: {}, database: ':memory:' });
  const http = server(b, c); await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => http.close(resolve)); b.close(); });
  const url = `http://127.0.0.1:${http.address().port}`;
  const body = JSON.stringify({ type: 'url_verification', challenge: 'challenge' });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sig = 'v0=' + createHmac('sha256', 'secret').update(`v0:${timestamp}:${body}`).digest('hex');
  const headers = { 'Content-Type': 'application/json', 'x-slack-request-timestamp': timestamp, 'x-slack-signature': sig };
  assert.equal((await fetch(url + '/healthz')).status, 200);
  assert.equal((await fetch(url + '/admin')).status, 404);
  const valid = await fetch(url + '/slack/events', { method: 'POST', headers, body });
  assert.equal(valid.status, 200); assert.equal(await valid.text(), 'challenge');
  assert.equal((await fetch(url + '/slack/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 403);
  assert.equal((await fetch(url + '/tally/enrollment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) })).status, 403);
  assert.equal((await fetch(url + '/twilio/inbound', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'Body=Hi' })).status, 403);
});

test('durable state survives restart and separate CLI transactions preserve worker changes', () => {
  mkdirSync('.test-data', { recursive: true });
  const path = join(mkdtempSync(join('.test-data', 'work-notes-test-')), 'bridge.sqlite');
  const a = new Store(path), b = new Store(path);
  a.change(s => { s.preferences.test = { revokedAt: 123 }; });
  b.change(s => { s.jobs.test = { state: 'sending' }; });
  assert.equal(a.read().preferences.test.revokedAt, 123); a.close(); b.close();
  const bridge = new Bridge({ config: {}, api: {}, database: path }); bridge.recover();
  assert.equal(bridge.store.read().jobs.test.state, 'uncertain');
  assert.equal(bridge.store.read().preferences.test.revokedAt, 123); bridge.close();
});
