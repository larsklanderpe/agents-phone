import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadConfig } from './config.mjs';
import { Bridge } from './bridge.mjs';
import { transport } from './transport.mjs';
import { server } from './http.mjs';

const c = loadConfig();
mkdirSync(dirname(c.database), { recursive: true });
const api = transport(c);
// The enabled service must prove its installation and campaign before listening.
if (c.smsEnabled) console.info(JSON.stringify(await api.preflight()));
const bridge = new Bridge({ config: c, api, database: c.database });
bridge.recover();
const http = server(bridge, c);
http.requestTimeout = 15000;
http.headersTimeout = 10000;
http.listen(c.port, '0.0.0.0', () => console.info(JSON.stringify({ event: 'listening', smsEnabled: c.smsEnabled })));
let busy = false, closing = false;
const timer = setInterval(async () => {
  if (busy || closing) return;
  busy = true;
  try { await bridge.workOne(); } catch { console.error('{"event":"worker_failed"}'); }
  finally { busy = false; }
}, 1100);
async function stop() {
  if (closing) return;
  closing = true; clearInterval(timer);
  http.close();
  while (busy) await new Promise(resolve => setTimeout(resolve, 50));
  bridge.close();
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
