const { getClient } = require('../_supabase');

function getDateRange(period) {
  const now = new Date();
  let start, prevStart;
  switch (period) {
    case '30d':
      start = new Date(now.getTime() - 30 * 86400000);
      prevStart = new Date(now.getTime() - 60 * 86400000);
      break;
    case '90d':
      start = new Date(now.getTime() - 90 * 86400000);
      prevStart = new Date(now.getTime() - 180 * 86400000);
      break;
    case 'all':
      start = new Date(0);
      prevStart = new Date(0);
      break;
    default:
      start = new Date(now.getTime() - 7 * 86400000);
      prevStart = new Date(now.getTime() - 14 * 86400000);
      break;
  }
  return { start, prevStart, end: start };
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const sb = getClient();
    const period = req.query.period || '7d';
    const { start, prevStart, end } = getDateRange(period);
    const isAllTime = period === 'all';

    // Fetch all leads
    const { data: allLeads } = await sb.from('leads')
      .select('source, status, created_at');

    // Fetch period page views
    const { data: periodViews } = await sb.from('page_views')
      .select('source')
      .gte('created_at', start.toISOString());

    const viewCount = (periodViews || []).length;

    // Previous period views
    let viewCountPrev = 0;
    if (!isAllTime) {
      const { count } = await sb.from('page_views')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', prevStart.toISOString())
        .lt('created_at', end.toISOString());
      viewCountPrev = count || 0;
    }

    // Traffic sources
    const trafficCounts = {};
    (periodViews || []).forEach(v => {
      const s = v.source || 'direct';
      trafficCounts[s] = (trafficCounts[s] || 0) + 1;
    });
    const trafficSources = Object.entries(trafficCounts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);

    const leads = allLeads || [];
    const periodLeads = leads.filter(l => new Date(l.created_at) >= start);
    const prevLeads = isAllTime ? [] : leads.filter(l => {
      const d = new Date(l.created_at);
      return d >= prevStart && d < end;
    });

    const sourceCounts = {};
    periodLeads.forEach(l => {
      sourceCounts[l.source] = (sourceCounts[l.source] || 0) + 1;
    });
    const sources = Object.entries(sourceCounts).map(([source, count]) => ({ source, count }));

    let hot = 0, active = 0, booked = 0, completed = 0, lost = 0;
    leads.forEach(l => {
      if (l.status === 'hot') hot++;
      else if (l.status === 'active') active++;
      else if (l.status === 'booked') booked++;
      else if (l.status === 'completed') completed++;
      else if (l.status === 'lost') lost++;
    });

    return res.json({
      period,
      visitors: viewCount,
      visitorsPrev: viewCountPrev,
      trafficSources,
      totalLeads: leads.length,
      leads: periodLeads.length,
      leadsPrev: prevLeads.length,
      sources,
      formLeads: periodLeads.filter(l => l.source === 'website_form').length,
      chatLeads: periodLeads.filter(l => l.source === 'chat_widget').length,
      contactLeads: periodLeads.filter(l => l.source === 'contact_form').length,
      hot, active, booked, completed, lost,
    });
  } catch (err) {
    console.error('Stats API error:', err);
    return res.status(500).json({ error: String(err) });
  }
};
