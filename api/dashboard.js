const { getClient } = require('./_supabase');

// Combined dashboard API — routes via ?action= parameter
// GET  ?action=stats&period=7d
// GET  ?action=leads&status=all
// PATCH ?action=leads  { id, ...fields }
// GET  ?action=messages&leadId=xxx
// POST ?action=review  { id }

function getDateRange(period) {
  const now = new Date();
  let start, prevStart;
  switch (period) {
    case '30d': start = new Date(now.getTime() - 30 * 86400000); prevStart = new Date(now.getTime() - 60 * 86400000); break;
    case '90d': start = new Date(now.getTime() - 90 * 86400000); prevStart = new Date(now.getTime() - 180 * 86400000); break;
    case 'all': start = new Date(0); prevStart = new Date(0); break;
    default: start = new Date(now.getTime() - 7 * 86400000); prevStart = new Date(now.getTime() - 14 * 86400000); break;
  }
  return { start, prevStart, end: start };
}

async function handleStats(req, res) {
  const sb = getClient();
  const period = req.query.period || '7d';
  const { start, prevStart, end } = getDateRange(period);
  const isAllTime = period === 'all';

  const { data: allLeads } = await sb.from('leads').select('source, status, created_at');
  const { data: periodViews } = await sb.from('page_views').select('source').gte('created_at', start.toISOString());
  const viewCount = (periodViews || []).length;

  let viewCountPrev = 0;
  if (!isAllTime) {
    const { count } = await sb.from('page_views').select('*', { count: 'exact', head: true }).gte('created_at', prevStart.toISOString()).lt('created_at', end.toISOString());
    viewCountPrev = count || 0;
  }

  const trafficCounts = {};
  (periodViews || []).forEach(v => { const s = v.source || 'direct'; trafficCounts[s] = (trafficCounts[s] || 0) + 1; });
  const trafficSources = Object.entries(trafficCounts).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count);

  const leads = allLeads || [];
  const periodLeads = leads.filter(l => new Date(l.created_at) >= start);
  const prevLeads = isAllTime ? [] : leads.filter(l => { const d = new Date(l.created_at); return d >= prevStart && d < end; });

  const sourceCounts = {};
  periodLeads.forEach(l => { sourceCounts[l.source] = (sourceCounts[l.source] || 0) + 1; });
  const sources = Object.entries(sourceCounts).map(([source, count]) => ({ source, count }));

  let hot = 0, active = 0, booked = 0, completed = 0, lost = 0;
  leads.forEach(l => {
    if (l.status === 'hot') hot++; else if (l.status === 'active') active++;
    else if (l.status === 'booked') booked++; else if (l.status === 'completed') completed++;
    else if (l.status === 'lost') lost++;
  });

  return res.json({
    period, visitors: viewCount, visitorsPrev: viewCountPrev, trafficSources,
    totalLeads: leads.length, leads: periodLeads.length, leadsPrev: prevLeads.length, sources,
    formLeads: periodLeads.filter(l => l.source === 'website_form').length,
    chatLeads: periodLeads.filter(l => l.source === 'chat_widget').length,
    contactLeads: periodLeads.filter(l => l.source === 'contact_form').length,
    hot, active, booked, completed, lost,
  });
}

async function handleLeadsGet(req, res) {
  const sb = getClient();
  const status = req.query.status;
  let query = sb.from('leads').select('*').order('created_at', { ascending: false });
  if (status && status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: String(error) });
  return res.json(data || []);
}

async function handleLeadsPatch(req, res) {
  const sb = getClient();
  const { id, ...fields } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  const allowed = ['status', 'notes', 'appointment_at', 'vehicle', 'name', 'phone', 'email', 'service', 'message'];
  const data = {};
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      data[key] = key === 'appointment_at' ? (fields[key] ? new Date(fields[key]).toISOString() : null) : fields[key];
    }
  }
  if (fields.appointmentAt !== undefined) {
    data.appointment_at = fields.appointmentAt ? new Date(fields.appointmentAt).toISOString() : null;
  }

  const { data: lead, error } = await sb.from('leads').update(data).eq('id', id).select().single();
  if (error) return res.status(404).json({ error: 'Lead not found' });
  return res.json(lead);
}

async function handleMessages(req, res) {
  const leadId = req.query.leadId;
  if (!leadId) return res.status(400).json({ error: 'Missing leadId' });
  const sb = getClient();
  const { data, error } = await sb.from('messages').select('*').eq('lead_id', leadId).order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: String(error) });
  return res.json(data || []);
}

async function handleReview(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { id } = req.body;
  const sb = getClient();

  const { data: lead, error } = await sb.from('leads').select('*').eq('id', id).single();
  if (error || !lead) return res.status(404).json({ error: 'Lead not found' });
  if (lead.review_sent) return res.status(400).json({ error: 'Review already sent' });

  const reviewUrl = 'https://www.yelp.com/biz/haus-of-wraps-san-diego';
  const smsBody = [
    `Hi ${lead.name.split(' ')[0]}! Thank you for choosing Haus of Wraps.`,
    '', `We hope your ${lead.service || 'wrap'} turned out amazing! If you have a moment, we'd really appreciate a quick review:`,
    '', reviewUrl, '', 'Thank you for your support!', '— The Haus of Wraps Team',
  ].join('\n');

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
  if (accountSid && authToken && twilioPhone && !accountSid.startsWith('your_')) {
    const twilio = require('twilio');
    const client = twilio(accountSid, authToken);
    await client.messages.create({ to: lead.phone, from: twilioPhone, body: smsBody });
  }

  await sb.from('leads').update({ review_sent: true, review_sent_at: new Date().toISOString() }).eq('id', id);
  return res.json({ ok: true });
}

module.exports = async (req, res) => {
  try {
    const action = req.query.action;
    if (action === 'stats') return handleStats(req, res);
    if (action === 'leads' && req.method === 'GET') return handleLeadsGet(req, res);
    if (action === 'leads' && req.method === 'PATCH') return handleLeadsPatch(req, res);
    if (action === 'messages') return handleMessages(req, res);
    if (action === 'review') return handleReview(req, res);
    return res.status(400).json({ error: 'Unknown action. Use ?action=stats|leads|messages|review' });
  } catch (err) {
    console.error('Dashboard API error:', err);
    return res.status(500).json({ error: String(err) });
  }
};
