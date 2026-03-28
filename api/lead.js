const { getClient } = require('./_supabase');

// Combined lead + track API — routes via ?action= parameter
// POST ?action=track  { path, referrer, utm_source, utm_medium, utm_campaign }
// POST (default)      { name, phone, ... }  — create lead

function parseSource(referrer, utmSource, utmMedium) {
  if (utmSource) {
    const src = utmSource.toLowerCase();
    const med = (utmMedium || '').toLowerCase();
    if (src === 'google' && ['cpc', 'ppc', 'paid'].includes(med)) return 'google_ads';
    if (src === 'google') return 'google_search';
    if (src === 'facebook' && ['cpc', 'paid', 'paidsocial'].includes(med)) return 'facebook_ads';
    if (src === 'facebook') return 'facebook';
    if (src === 'instagram' && ['cpc', 'paid'].includes(med)) return 'instagram_ads';
    if (src === 'instagram') return 'instagram';
    if (src === 'bing' && ['cpc', 'ppc'].includes(med)) return 'bing_ads';
    if (src === 'bing') return 'bing';
    if (src === 'yelp') return 'yelp';
    if (src === 'nextdoor') return 'nextdoor';
    if (src === 'tiktok') return 'tiktok';
    return src;
  }
  if (!referrer) return 'direct';
  const r = referrer.toLowerCase();
  if (r.includes('google.com/search') || r.includes('google.com/url')) return 'google_search';
  if (r.includes('google.com/maps') || r.includes('maps.google')) return 'google_maps';
  if (r.includes('google.com')) return 'google';
  if (r.includes('bing.com')) return 'bing';
  if (r.includes('duckduckgo.com')) return 'duckduckgo';
  if (r.includes('yahoo.com')) return 'yahoo';
  if (r.includes('chat.openai.com') || r.includes('chatgpt.com')) return 'chatgpt';
  if (r.includes('gemini.google.com')) return 'gemini';
  if (r.includes('perplexity.ai')) return 'perplexity';
  if (r.includes('claude.ai')) return 'claude';
  if (r.includes('copilot.microsoft.com')) return 'copilot';
  if (r.includes('yelp.com')) return 'yelp';
  if (r.includes('facebook.com') || r.includes('fb.com')) return 'facebook';
  if (r.includes('instagram.com')) return 'instagram';
  if (r.includes('nextdoor.com')) return 'nextdoor';
  if (r.includes('bbb.org')) return 'bbb';
  if (r.includes('tiktok.com')) return 'tiktok';
  if (r.includes('t.co') || r.includes('twitter.com') || r.includes('x.com')) return 'twitter';
  if (r.includes('linkedin.com')) return 'linkedin';
  if (r.includes('reddit.com')) return 'reddit';
  return 'referral';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Page view tracking
  if (req.query.action === 'track') {
    try {
      const { path, referrer, utm_source, utm_medium, utm_campaign } = req.body;
      const source = parseSource(referrer, utm_source, utm_medium);
      const sb = getClient();
      await sb.from('page_views').insert({
        path: path || '/', referrer: referrer || null, source,
        utm_source: utm_source || null, utm_medium: utm_medium || null, utm_campaign: utm_campaign || null,
      });
      return res.json({ ok: true });
    } catch { return res.json({ ok: true }); }
  }

  try {
    const { name, phone, email, service, vehicle, message, source, referral, visualizer_image, visualizer_config } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });

    const sb = getClient();

    // Upload visualizer image to Supabase storage if provided
    let image_url = null;
    if (visualizer_image && visualizer_image.startsWith('data:')) {
      try {
        const base64 = visualizer_image.split(',')[1];
        const buffer = Buffer.from(base64, 'base64');
        const filename = `leads/${Date.now()}-${phone.replace(/\D/g,'')}.jpg`;
        const { data: uploadData, error: uploadErr } = await sb.storage
          .from('visualizer-images')
          .upload(filename, buffer, { contentType: 'image/jpeg', upsert: true });
        if (!uploadErr && uploadData) {
          const { data: urlData } = sb.storage.from('visualizer-images').getPublicUrl(filename);
          image_url = urlData?.publicUrl || null;
        }
      } catch (imgErr) {
        console.error('Image upload failed:', imgErr);
      }
    }

    const { error } = await sb.from('leads').insert({
      name,
      phone,
      email: email || null,
      service: service || null,
      vehicle: vehicle || null,
      message: message || null,
      source: source || 'website_form',
      referral: referral || null,
      image_url,
      visualizer_config: visualizer_config || null,
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
