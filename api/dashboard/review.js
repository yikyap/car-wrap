const { getClient } = require('../_supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { id } = req.body;
    const sb = getClient();

    const { data: lead, error } = await sb.from('leads').select('*').eq('id', id).single();
    if (error || !lead) return res.status(404).json({ error: 'Lead not found' });
    if (lead.review_sent) return res.status(400).json({ error: 'Review already sent' });

    const reviewUrl = 'https://www.yelp.com/biz/haus-of-wraps-san-diego';
    const smsBody = [
      `Hi ${lead.name.split(' ')[0]}! Thank you for choosing Haus of Wraps.`,
      '',
      `We hope your ${lead.service || 'wrap'} turned out amazing! If you have a moment, we'd really appreciate a quick review:`,
      '',
      reviewUrl,
      '',
      'Thank you for your support!',
      '— The Haus of Wraps Team',
    ].join('\n');

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    if (accountSid && authToken && twilioPhone && !accountSid.startsWith('your_')) {
      const twilio = require('twilio');
      const client = twilio(accountSid, authToken);
      await client.messages.create({ to: lead.phone, from: twilioPhone, body: smsBody });
    }

    await sb.from('leads').update({
      review_sent: true,
      review_sent_at: new Date().toISOString(),
    }).eq('id', id);

    return res.json({ ok: true });
  } catch (err) {
    console.error('Review API error:', err);
    return res.status(500).json({ error: String(err) });
  }
};
