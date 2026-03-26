const { getClient } = require('./_supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { name, phone, email, service, vehicle, message, source, referral } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });

    const sb = getClient();
    const { error } = await sb.from('leads').insert({
      name,
      phone,
      email: email || null,
      service: service || null,
      vehicle: vehicle || null,
      message: message || null,
      source: source || 'website_form',
      referral: referral || null,
      status: 'hot',
    });

    if (error) {
      console.error('Lead insert error:', error);
      return res.status(500).json({ error: 'Failed to save lead' });
    }

    // Twilio SMS (only if configured)
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
    const shopPhone = process.env.SHOP_OWNER_PHONE;

    if (accountSid && authToken && twilioPhone && !accountSid.startsWith('your_')) {
      try {
        const twilio = require('twilio');
        const client = twilio(accountSid, authToken);
        const firstName = name.split(' ')[0];

        // Auto-reply to customer
        await client.messages.create({
          to: phone,
          from: twilioPhone,
          body: [
            `Hi ${firstName}! Thanks for reaching out to Haus of Wraps.`,
            '',
            `We received your inquiry${service ? ` about ${service}` : ''} and will get back to you shortly.`,
            '',
            'Need immediate help? Call us: (619) 512-9727',
            '',
            '— The Haus of Wraps Team',
          ].join('\n'),
        });

        // Notify shop owner
        if (shopPhone) {
          await client.messages.create({
            to: shopPhone,
            from: twilioPhone,
            body: [
              'New lead from website:',
              '',
              `Name: ${name}`,
              `Phone: ${phone}`,
              email ? `Email: ${email}` : '',
              vehicle ? `Vehicle: ${vehicle}` : '',
              service ? `Service: ${service}` : '',
              `Source: ${source || 'website_form'}`,
              referral ? `Referral: ${referral}` : '',
              '',
              `Auto-reply sent. Call ${phone} to follow up.`,
            ].filter(Boolean).join('\n'),
          });
        }
      } catch (smsErr) {
        console.error('SMS send failed:', smsErr);
      }
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('Lead API error:', err);
    return res.status(500).json({ error: 'Failed to save lead' });
  }
};
