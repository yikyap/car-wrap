const { getClient } = require('./_supabase');

// Combined SMS API — routes via ?action= parameter
// POST ?action=inbound  (Twilio webhook)
// POST ?action=reply     { leadId, body }

async function handleInbound(req, res) {
  const from = req.body.From;
  const body = req.body.Body;
  if (!from || !body) return res.setHeader('Content-Type', 'text/xml').send('<Response></Response>');

  const sb = getClient();
  const cleanPhone = from.replace(/[\s\-\(\)\+]/g, '').slice(-10);

  const { data: leads } = await sb.from('leads').select('id, phone').order('created_at', { ascending: false });
  const lead = (leads || []).find(l => l.phone.replace(/[\s\-\(\)\+]/g, '').slice(-10) === cleanPhone);

  if (lead) {
    await sb.from('messages').insert({ lead_id: lead.id, direction: 'inbound', body });
  }

  return res.setHeader('Content-Type', 'text/xml').send('<Response></Response>');
}

async function handleReply(req, res) {
  const { leadId, body: smsBody, message } = req.body;
  const text = smsBody || message;
  if (!leadId || !text) return res.status(400).json({ error: 'Missing leadId or body' });

  const sb = getClient();
  const { data: lead, error } = await sb.from('leads').select('phone').eq('id', leadId).single();
  if (error || !lead) return res.status(404).json({ error: 'Lead not found' });

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
  if (accountSid && authToken && twilioPhone && !accountSid.startsWith('your_')) {
    const twilio = require('twilio');
    const client = twilio(accountSid, authToken);
    await client.messages.create({ to: lead.phone, from: twilioPhone, body: text });
  }

  await sb.from('messages').insert({ lead_id: leadId, direction: 'outbound', body: text });
  return res.json({ ok: true });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const action = req.query.action;
    if (action === 'inbound') return handleInbound(req, res);
    if (action === 'reply') return handleReply(req, res);
    return res.status(400).json({ error: 'Unknown action. Use ?action=inbound|reply' });
  } catch (err) {
    console.error('SMS API error:', err);
    return res.setHeader('Content-Type', 'text/xml').send('<Response></Response>');
  }
};
