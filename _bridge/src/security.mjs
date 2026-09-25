import { createHmac, timingSafeEqual } from 'node:crypto';

function equal(received, expected) {
  if (typeof received !== 'string') return false;
  const a = Buffer.from(received), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function slackSignature(secret, timestamp, body, signature, now = Date.now()) {
  if (!secret || !/^\d+$/.test(timestamp || '') || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  return equal(signature, 'v0=' + createHmac('sha256', secret).update(`v0:${timestamp}:`).update(body).digest('hex'));
}
export function tallySignature(secret, payload, signature) {
  return !!secret && equal(signature, createHmac('sha256', secret).update(JSON.stringify(payload)).digest('base64'));
}
export function formBody(body) {
  const pairs = new URLSearchParams(body.toString('utf8'));
  const result = Object.create(null);
  for (const [key, value] of pairs) {
    if (Object.hasOwn(result, key)) throw new Error('duplicate_parameter');
    result[key] = value;
  }
  return result;
}
export function twilioSignature(secret, url, params, signature) {
  const data = url + Object.keys(params).sort().map(key => key + params[key]).join('');
  return !!secret && equal(signature, createHmac('sha1', secret).update(data).digest('base64'));
}

export function tallyEnrollment(p, c) {
  if (p.eventType !== 'FORM_RESPONSE' || p.data?.formId !== c.form) throw new Error('wrong_form');
  const fields = p.data.fields;
  if (!Array.isArray(fields) || new Set(fields.map(f => f.key)).size !== fields.length) throw new Error('invalid_fields');
  const get = (name, type) => {
    const key = c.tallyFields?.[name];
    const field = fields.find(f => f.key === key);
    if (!key || !field || field.type !== type) throw new Error(`field_mapping_required:${name}`);
    return field;
  };
  const consentField = get('consent', 'CHECKBOXES');
  if (consentField.value != null && !Array.isArray(consentField.value)) throw new Error('invalid_consent_value');
  const selected = consentField.value || [];
  const option = consentField.options?.find(o => o.id === c.tallyFields.consentOption);
  if (!option || option.text !== c.consentText || selected.some(id => id !== option.id)) throw new Error('consent_option_mismatch');
  const consent = selected.includes(option.id);
  return {
    id: p.data.submissionId, submittedAt: Date.parse(p.data.createdAt),
    phone: String(get('phone', 'INPUT_PHONE_NUMBER').value || '').replace(/[ ()-]/g, '') || null,
    submittedPhone: get('phone', 'INPUT_PHONE_NUMBER').value || null,
    name: get('name', 'INPUT_TEXT').value || '', email: get('email', 'INPUT_EMAIL').value || '',
    version: get('version', 'CALCULATED_FIELDS').value, consent,
    consentText: consent ? option.text : null,
  };
}
