const { getClient } = require('../_supabase');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const leadId = req.query.leadId;
    if (!leadId) return res.status(400).json({ error: 'Missing leadId' });

    const sb = getClient();
    const { data, error } = await sb.from('messages')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: String(error) });
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
};
