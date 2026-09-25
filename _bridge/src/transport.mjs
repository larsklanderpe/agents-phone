function failure(code, definite = false) {
  const error = new Error('provider_request_failed');
  error.code = code;
  error.definite = definite;
  return error;
}

export function transport(c, fetcher = fetch) {
  const basic = 'Basic ' + Buffer.from(`${c.account}:${c.twilioToken}`).toString('base64');
  async function request(url, options = {}) {
    let response, data;
    try {
      response = await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(10000) });
      data = await response.json();
    } catch { throw failure('network_or_json_error'); }
    // URL has no credentials or message body. Never log response text or headers.
    console.info(JSON.stringify({ boundary: new URL(url).pathname, host: new URL(url).hostname, status: response.status }));
    if (!response.ok) throw failure(data.code || response.status, response.status >= 400 && response.status < 500);
    return data;
  }
  const slack = (method, body, verb = 'POST') => request(`https://slack.com/api/${method}${verb === 'GET' ? '?' + new URLSearchParams(body) : ''}`, {
    method: verb, headers: { Authorization: `Bearer ${c.slackToken}`, 'Content-Type': 'application/json; charset=utf-8' },
    ...(verb === 'GET' ? {} : { body: JSON.stringify(body) }),
  }).then(data => { if (!data.ok) throw failure(data.error || 'slack_error', true); return data; });
  const twilio = url => request(url, { headers: { Authorization: basic } });
  return {
    async postSlack({ text, thread }) {
      return slack('chat.postMessage', { channel: c.channel, text, ...(thread ? { thread_ts: thread } : {}),
        mrkdwn: false, parse: 'none', unfurl_links: false, unfurl_media: false,
        blocks: text.match(/[\s\S]{1,3000}/g).map(part => ({ type: 'section', text: { type: 'plain_text', text: part, emoji: false } })) });
    },
    async sendSms({ phone, text, id }) {
      const data = await request(`https://api.twilio.com/2010-04-01/Accounts/${c.account}/Messages.json`, {
        method: 'POST', headers: { Authorization: basic, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: phone, From: c.number, MessagingServiceSid: c.service, Body: text,
          StatusCallback: `${c.origin}/twilio/status/${id}` }).toString(),
      });
      if (data.to !== phone || data.from !== c.number || data.messaging_service_sid !== c.service || data.account_sid !== c.account) throw failure('twilio_receipt_mismatch');
      return data;
    },
    async message(sid) {
      if (!/^SM[a-f0-9]{32}$/i.test(sid)) throw new Error('invalid_message_sid');
      return twilio(`https://api.twilio.com/2010-04-01/Accounts/${c.account}/Messages/${sid}.json`);
    },
    async preflight() {
      const auth = await slack('auth.test', {});
      if (auth.team_id !== c.team || auth.bot_id !== c.bot) throw new Error('wrong_slack_installation');
      const channel = await slack('conversations.info', { channel: c.channel }, 'GET');
      if (!channel.channel?.is_private || !channel.channel.is_member) throw new Error('private_channel_membership_required');
      const service = await twilio(`https://messaging.twilio.com/v1/Services/${c.service}`);
      if (service.account_sid !== c.account) throw new Error('wrong_twilio_service');
      const numbers = await twilio(`https://messaging.twilio.com/v1/Services/${c.service}/PhoneNumbers`);
      if (!numbers.phone_numbers?.some(n => n.phone_number === c.number)) throw new Error('number_not_in_service');
      const campaigns = await twilio(`https://messaging.twilio.com/v1/Services/${c.service}/Compliance/Usa2p`);
      const approved = campaigns.compliance?.some(p => p.campaign_status === 'VERIFIED' && !p.mock && p.messaging_service_sid === c.service) === true;
      if (c.smsEnabled && (!c.a2pApproved || !approved)) throw new Error('campaign_not_verified');
      return { slack: 'verified', number: 'verified', campaignVerified: approved, smsEnabled: c.smsEnabled };
    },
  };
}
