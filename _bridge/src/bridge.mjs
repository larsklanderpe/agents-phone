import { randomUUID } from 'node:crypto';
import { Store } from './store.mjs';

export const CONSENT_VERSION = 'work-notes-sms-v1-2026-09-25';
export const CONSENT_TEXT = 'I agree to receive automated SMS/text messages from Lars Klander Personal / Work Notes at the mobile number provided above, including work-request acknowledgments, clarification questions, and task updates. Message frequency varies. Message and data rates may apply. Reply STOP to unsubscribe or HELP for help. SMS consent is optional and is not a condition of purchase or access to the service.';
export const WELCOME = 'Lars Klander Personal / Work Notes: Your SMS enrollment is approved. You will receive work-request acknowledgments, questions, and updates. Message frequency varies. Message and data rates may apply. Reply STOP to unsubscribe or HELP for help. Contact: lars.klander@gmail.com.';
const STOP = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT']);
const CONTROL = new Set([...STOP, 'START', 'UNSTOP', 'HELP', 'INFO']);
const phonePattern = /^\+[1-9]\d{7,14}$/;
const stamp = () => Date.now();
const clean = (text) => String(text).replace(/<([^>|]+)\|([^>]+)>/g, '$2 ($1)')
  .replace(/<(https?:\/\/[^>]+)>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export class Bridge {
  constructor({ config, api, database }) {
    this.config = config;
    this.api = api;
    this.store = new Store(database);
  }
  close() { this.store.close(); }
  audit(s, action, details) { s.audit.push({ at: stamp(), action, ...details }); }
  addJob(s, kind, data) {
    const id = randomUUID();
    s.jobs[id] = { id, kind, ...data, state: 'queued', createdAt: stamp() };
    return id;
  }
  note(s, thread, text) {
    if (thread) this.addJob(s, 'note', { thread, text: `Work Notes bridge: ${text}` });
  }
  enroll(input) {
    if (typeof input.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(input.id) || ['__proto__', 'constructor', 'prototype'].includes(input.id) || !Number.isFinite(input.submittedAt) || input.submittedAt > stamp() + 300000) throw new Error('invalid_submission');
    if (typeof input.consent !== 'boolean' || (input.consent && (!phonePattern.test(input.phone) || input.version !== this.config.consentVersion || input.consentText !== this.config.consentText))) throw new Error('invalid_consent');
    return this.store.change(s => {
      if (s.submissions[input.id]) return 'duplicate';
      s.submissions[input.id] = { ...input, approvedAt: null, receivedAt: stamp() };
      this.audit(s, 'enrollment_recorded', { submission: input.id, consent: input.consent === true });
      return 'pending';
    });
  }
  approve(id, actor, confirmedNumber) {
    return this.store.change(s => {
      const sub = s.submissions[id];
      if (!this.config.users.includes(actor)) throw new Error('unauthorized_owner');
      if (!sub?.consent || sub.version !== this.config.consentVersion || sub.consentText !== this.config.consentText) throw new Error('affirmative_consent_required');
      if (confirmedNumber !== sub.phone || !this.config.recipients.includes(sub.phone)) throw new Error('approved_number_required');
      const pref = s.preferences[sub.phone] || {};
      if (pref.revokedAt && sub.submittedAt <= pref.revokedAt) throw new Error('fresh_consent_required');
      if (pref.providerBlocked) throw new Error('provider_blocked_reply_START_first');
      if (pref.submission === id && sub.approvedAt) return 'already_approved';
      sub.approvedAt = stamp();
      sub.approvedBy = actor;
      s.preferences[sub.phone] = { ...pref, submission: id, revokedAt: null, welcomedAt: null };
      this.audit(s, 'approved', { submission: id, actor });
      return 'approved';
    });
  }
  permission(phone, welcome = false, s = this.store.read()) {
    let reason;
    const pref = s.preferences[phone];
    const sub = s.submissions[pref?.submission];
    if (!this.config.smsEnabled || !this.config.a2pApproved) reason = 'sending_disabled';
    else if (!this.config.recipients.includes(phone)) reason = 'number_not_allowed';
    else if (pref?.revokedAt || pref?.providerBlocked) reason = 'unsubscribed';
    else if (!sub?.approvedAt || !sub.consent || sub.phone !== phone || sub.version !== this.config.consentVersion || sub.consentText !== this.config.consentText) reason = 'not_approved';
    else if (!welcome && !pref.welcomedAt) reason = 'welcome_required';
    return { allowed: !reason, reason: reason || 'allowed' };
  }
  revoke(phone, actor = 'recipient', s) {
    const update = state => {
      state.preferences[phone] = { ...state.preferences[phone], revokedAt: stamp(), welcomedAt: null };
      this.audit(state, 'revoked', { phone, actor });
    };
    if (s) update(s); else this.store.change(update);
  }
  queueWelcome(phone) {
    return this.store.change(s => {
      const permission = this.permission(phone, true, s);
      if (!permission.allowed) throw new Error(permission.reason);
      const submission = s.preferences[phone].submission;
      if (Object.values(s.jobs).some(j => j.kind === 'welcome' && j.submission === submission)) throw new Error('welcome_already_attempted');
      return this.addJob(s, 'welcome', { phone, text: WELCOME, submission });
    });
  }
  inbound(p) {
    if (p.To !== this.config.number || !this.config.recipients.includes(p.From) || !/^(SM|MM)[a-zA-Z0-9]+$/.test(p.MessageSid || '')) return 'ignored';
    return this.store.change(s => {
      const key = `twilio:${p.MessageSid}`;
      if (s.seen[key]) return 'duplicate';
      s.seen[key] = stamp();
      const word = (p.Body || '').trim().toUpperCase();
      const type = p.OptOutType?.toUpperCase();
      if (type === 'STOP' || STOP.has(word)) {
        this.revoke(p.From, 'recipient', s);
        s.preferences[p.From].providerBlocked = true;
        return 'control';
      }
      if (type === 'START' || word === 'START' || word === 'UNSTOP') {
        s.preferences[p.From] = { ...s.preferences[p.From], providerBlocked: false };
        this.audit(s, 'provider_unblocked_without_approval', { phone: p.From });
        return 'control';
      }
      if (type === 'HELP' || CONTROL.has(word)) return 'control';
      const text = String(p.Body || '').slice(0, 10000);
      this.addJob(s, 'inbound', { phone: p.From, text, sid: p.MessageSid, media: Number(p.NumMedia || 0) });
      return 'queued';
    });
  }
  slack(p) {
    const c = this.config, e = p.event;
    if (p.type !== 'event_callback' || p.team_id !== c.team || p.api_app_id !== c.app || !p.event_id ||
        e?.type !== 'message' || e.channel !== c.channel || !e.thread_ts || e.thread_ts === e.ts ||
        e.subtype || e.bot_id || !c.users.includes(e.user)) return 'ignored';
    return this.store.change(s => {
      const thread = s.threads[e.thread_ts];
      if (!thread) return 'unmapped';
      if (s.seen[`slack:${p.event_id}`] || s.seen[`message:${e.channel}:${e.ts}`]) return 'duplicate';
      s.seen[`slack:${p.event_id}`] = stamp();
      s.seen[`message:${e.channel}:${e.ts}`] = stamp();
      const text = clean(e.text || '').trim();
      if (/^INTERNAL:/i.test(text)) return 'internal';
      let reason = this.permission(thread.phone, false, s).reason;
      if (!text || e.files?.length || e.attachments?.length) reason = 'text_only_required';
      else if (text.length > 1500) reason = 'reply_too_long';
      else if (!Number.isFinite(Number(e.ts)) || Math.abs(stamp() - Number(e.ts) * 1000) > c.maxAgeSeconds * 1000) reason = 'reply_expired';
      if (reason !== 'allowed') {
        this.note(s, e.thread_ts, `SMS not sent (${reason}). Send a new reply after resolving this.`);
        return reason;
      }
      this.addJob(s, 'reply', { phone: thread.phone, thread: e.thread_ts, text: `Work Notes: ${text}`,
        submission: s.preferences[thread.phone].submission });
      return 'queued';
    });
  }
  recover() {
    this.store.change(s => {
      for (const job of Object.values(s.jobs)) if (job.state === 'sending') {
        job.state = 'uncertain';
        this.audit(s, 'interrupted_send_needs_review', { job: job.id });
      }
    });
  }
  async workOne() {
    const job = this.store.change(s => {
      const next = Object.values(s.jobs).find(j => j.state === 'queued');
      if (!next) return null;
      if (['reply', 'welcome'].includes(next.kind)) {
        const permission = this.permission(next.phone, next.kind === 'welcome', s);
        const stale = stamp() - next.createdAt > this.config.maxAgeSeconds * 1000;
        if (!permission.allowed || stale || s.preferences[next.phone]?.submission !== next.submission) {
          next.state = 'cancelled';
          next.reason = stale ? 'expired' : permission.reason === 'allowed' ? 'consent_changed' : permission.reason;
          this.note(s, next.thread, `SMS cancelled (${next.reason}).`);
          return { skipped: true };
        }
      }
      next.state = 'sending';
      next.attemptedAt = stamp();
      return { ...next };
    });
    if (!job) return false;
    if (job.skipped) return true;
    try {
      if (job.kind === 'inbound' || job.kind === 'note') {
        const text = job.kind === 'inbound'
          ? `SMS from ${job.phone}: ${job.text}${job.media ? '\n[Media not forwarded. Ask the sender for text.]' : ''}\n\nReply in this thread to send SMS after enrollment approval. Prefix private notes with INTERNAL:.`
          : job.text;
        const result = await this.api.postSlack({ text, thread: job.thread });
        if (result.channel !== this.config.channel || !result.ts) throw new Error('unverified_slack_receipt');
        this.store.change(s => {
          if (job.kind === 'inbound') s.threads[result.ts] = { phone: job.phone, sid: job.sid, createdAt: stamp() };
          s.jobs[job.id].state = 'posted';
          s.jobs[job.id].slackTs = result.ts;
        });
      } else {
        const result = await this.api.sendSms({ phone: job.phone, text: job.text, id: job.id });
        if (!result.sid || !result.status) throw new Error('unverified_twilio_receipt');
        this.store.change(s => {
          const current = s.jobs[job.id];
          if (current.sid && current.sid !== result.sid) throw new Error('twilio_receipt_conflict');
          current.sid = result.sid;
          if (current.state === 'sending') current.state = 'accepted';
          this.audit(s, 'provider_accepted_not_delivered', { job: job.id, sid: result.sid });
        });
        this.status(job.id, { MessageSid: result.sid, From: this.config.number, To: job.phone,
          MessageStatus: result.status, ErrorCode: String(result.error_code || '') });
      }
    } catch (error) {
      this.store.change(s => {
        const current = s.jobs[job.id];
        // A callback may have arrived before a network timeout. Never overwrite it.
        if (current.state !== 'sending') return;
        current.state = error.definite ? 'failed' : 'uncertain';
        current.error = String(error.code || 'transport_or_receipt_error').slice(0, 80);
        if (error.code === 21610) this.revoke(job.phone, 'twilio_opt_out', s);
        this.audit(s, current.state, { job: job.id, code: current.error });
        if (job.kind !== 'note') this.note(s, job.thread, `Delivery ${current.state}. Reference ${job.id}. No automatic retry.`);
      });
    }
    return true;
  }
  status(id, p) {
    return this.store.change(s => {
      const job = s.jobs[id];
      if (!job || !['reply', 'welcome'].includes(job.kind) || !job.attemptedAt ||
          p.To !== job.phone || p.From !== this.config.number || !/^SM[a-zA-Z0-9]+$/.test(p.MessageSid || '') ||
          (job.sid && job.sid !== p.MessageSid)) return 'ignored';
      const states = { accepted: 1, scheduled: 1, queued: 1, sending: 2, sent: 3, delivered: 4, undelivered: 4, failed: 4, canceled: 4 };
      const status = p.MessageStatus;
      if (!states[status] || states[status] <= (states[job.providerStatus] || 0)) return 'ignored';
      job.sid = p.MessageSid;
      job.providerStatus = status;
      job.state = states[status] === 4 ? (status === 'delivered' ? 'delivered' : 'failed') : 'accepted';
      const pref = s.preferences[job.phone];
      if (status === 'delivered' && job.kind === 'welcome' && pref?.submission === job.submission &&
          !pref.revokedAt && !pref.providerBlocked && s.submissions[job.submission]?.approvedAt) {
        s.preferences[job.phone].welcomedAt = stamp();
      }
      if (states[status] === 4) this.note(s, job.thread, status === 'delivered'
        ? 'SMS delivered.' : `SMS delivery failed (${p.ErrorCode || status}). Check the Twilio message log; no automatic retry.`);
      if (p.ErrorCode === '21610') this.revoke(job.phone, 'twilio_opt_out', s);
      this.audit(s, 'delivery_status', { job: id, status });
      return 'recorded';
    });
  }
}
