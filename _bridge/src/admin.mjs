import { backup } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { loadConfig } from './config.mjs';
import { Bridge } from './bridge.mjs';
import { transport } from './transport.mjs';

const c = loadConfig(), api = transport(c);
const bridge = new Bridge({ config: c, api, database: c.database });
const [command, ...args] = process.argv.slice(2);
try {
  let result;
  switch (command) {
    case 'preflight': result = await api.preflight(); break;
    case 'schema': result = bridge.store.read().tallySchema || 'Submit a signed test form first.'; break;
    case 'enrollments': result = Object.values(bridge.store.read().submissions); break;
    case 'jobs': result = Object.values(bridge.store.read().jobs).map(({ text, ...job }) => job); break;
    case 'audit': result = bridge.store.read().audit.slice(-100); break;
    case 'approve': {
      const [id, actor, phone] = args;
      if (!id || !actor || !phone) throw new Error('usage: approve SUBMISSION_ID OWNER_SLACK_ID CONFIRMED_E164_NUMBER');
      result = bridge.approve(id, actor, phone); break;
    }
    case 'revoke': {
      const [phone, actor] = args;
      if (!c.recipients.includes(phone) || !c.users.includes(actor)) throw new Error('usage: revoke ALLOWED_E164_NUMBER OWNER_SLACK_ID');
      bridge.revoke(phone, actor); result = 'revoked'; break;
    }
    case 'welcome': {
      const [phone] = args;
      await api.preflight();
      result = { queuedJob: bridge.queueWelcome(phone), note: 'Worker sends once. Wait for delivered status before replying.' }; break;
    }
    case 'reconcile': {
      const [id, sid] = args;
      const job = bridge.store.read().jobs[id];
      if (!job || !['welcome', 'reply'].includes(job.kind) || !job.attemptedAt) throw new Error('unknown_sms_job');
      const m = await api.message(sid || job.sid);
      if (m.account_sid !== c.account || m.messaging_service_sid !== c.service || m.body !== job.text || m.to !== job.phone || m.from !== c.number ||
          Math.abs(Date.parse(m.date_created) - job.attemptedAt) > 60000) throw new Error('message_does_not_match_job');
      result = bridge.status(id, { MessageSid: m.sid, To: m.to, From: m.from, MessageStatus: m.status, ErrorCode: String(m.error_code || '') });
      break;
    }
    case 'backup': {
      const [path] = args;
      if (!path || !isAbsolute(path) || existsSync(path)) throw new Error('usage: backup NEW_PRIVATE_ABSOLUTE_PATH');
      await backup(bridge.store.db, path); result = 'backup_written_keep_private'; break;
    }
    default: throw new Error('commands: preflight, schema, enrollments, jobs, audit, approve, revoke, welcome, reconcile, backup');
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message === 'provider_request_failed' ? `provider_request_failed:${error.code}` : error.message);
  process.exitCode = 1;
} finally { bridge.close(); }
