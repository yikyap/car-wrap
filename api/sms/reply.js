const { getClient } = require('../_supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { leadId, body: smsBody, message } = req.body;
    const text = smsBody || message;
    if (!leadId || !text) return res.status(400).json({ error: 'Missing leadId or body' });

    const sb = getClient();
    const { data: lead, error } = await sb.from('leads').select('phone').eq('id', leadId).single();
    if (error || !lead) return res.status(404).json({ error: 'Lead not found' });

    // Send via Twilio
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    if (accountSid && authToken && twilioPhone && !accountSid.startsWith('your_')) {
      const twilio = require('twilio');
      const client = twilio(accountSid, authToken);
      await client.messages.create({ to: lead.phone, from: twilioPhone, body: text });
    }

    // Log message
    await sb.from('messages').insert({
      lead_id: leadId,
      direction: 'outbound',
      body: text,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('Reply SMS error:', err);
    return res.status(500).json({ error: String(err) });
  }
};
