import { createServer } from 'node:http';
import { slackSignature, tallySignature, tallyEnrollment, twilioSignature, formBody } from './security.mjs';

export function server(bridge, c) {
  return createServer(async (req, res) => {
    const reply = (code, body, type = 'text/plain') => {
      res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(body);
    };
    try {
      if (req.method === 'GET' && req.url === '/healthz') return reply(200, 'ok');
      const statusPath = /^\/twilio\/status\/([a-f0-9-]{36})$/.exec(req.url || '');
      if (req.method !== 'POST' || !(['/slack/events', '/tally/enrollment', '/twilio/inbound'].includes(req.url) || statusPath)) return reply(404, 'not found');
      let size = 0; const parts = [];
      for await (const part of req) {
        size += part.length;
        if (size > 262144) return reply(413, 'too large');
        parts.push(part);
      }
      const raw = Buffer.concat(parts);
      const contentType = req.headers['content-type']?.split(';')[0].trim();
      if (req.url === '/slack/events') {
        if (contentType !== 'application/json') return reply(415, 'JSON required');
        if (!slackSignature(c.slackSecret, req.headers['x-slack-request-timestamp'], raw, req.headers['x-slack-signature'])) return reply(403, 'invalid signature');
        const p = JSON.parse(raw);
        if (p.type === 'url_verification' && typeof p.challenge === 'string') return reply(200, p.challenge);
        bridge.slack(p);
        return reply(200, 'ok');
      }
      if (req.url === '/tally/enrollment') {
        if (contentType !== 'application/json') return reply(415, 'JSON required');
        const p = JSON.parse(raw);
        if (!tallySignature(c.tallySecret, p, req.headers['tally-signature'])) return reply(403, 'invalid signature');
        if (p.data?.formId !== c.form || p.eventType !== 'FORM_RESPONSE') return reply(403, 'wrong form');
        // Inspect mapping in the private shell without logging any respondent values.
        bridge.store.change(s => { s.tallySchema = (p.data.fields || []).map(f => ({ key: f.key, label: f.label, type: f.type, options: f.options })); });
        try { bridge.enroll(tallyEnrollment(p, c)); }
        catch { return reply(503, 'enrollment configuration requires owner review'); }
        return reply(200, 'recorded');
      }
      if (contentType !== 'application/x-www-form-urlencoded') return reply(415, 'form required');
      const p = formBody(raw);
      if (!twilioSignature(c.twilioToken, c.origin + req.url, p, req.headers['x-twilio-signature']) || p.AccountSid !== c.account) return reply(403, 'invalid signature or account');
      if (statusPath) { bridge.status(statusPath[1], p); return reply(200, 'ok'); }
      bridge.inbound(p);
      return reply(200, '<?xml version="1.0" encoding="UTF-8"?><Response/>', 'text/xml');
    } catch (error) {
      const badRequest = error instanceof SyntaxError || error.message === 'duplicate_parameter';
      console.error(JSON.stringify({ event: badRequest ? 'bad_request' : 'request_failed' }));
      if (!res.headersSent) reply(badRequest ? 400 : 500, 'request failed'); else res.end();
    }
  });
}
