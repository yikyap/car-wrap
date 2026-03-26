const { getClient } = require('./_supabase');

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

  try {
    const { path, referrer, utm_source, utm_medium, utm_campaign } = req.body;
    const source = parseSource(referrer, utm_source, utm_medium);

    const sb = getClient();
    await sb.from('page_views').insert({
      path: path || '/',
      referrer: referrer || null,
      source,
      utm_source: utm_source || null,
      utm_medium: utm_medium || null,
      utm_campaign: utm_campaign || null,
    });

    return res.json({ ok: true });
  } catch {
    return res.json({ ok: true });
  }
};
