const { getClient } = require('../_supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.setHeader('Content-Type', 'text/xml').send('<Response></Response>');
  }

  try {
    const from = req.body.From;
    const body = req.body.Body;

    if (!from || !body) {
      return res.setHeader('Content-Type', 'text/xml').send('<Response></Response>');
    }

    const sb = getClient();
    const cleanPhone = from.replace(/[\s\-\(\)\+]/g, '').slice(-10);

    // Find lead by phone
    const { data: leads } = await sb.from('leads')
      .select('id, phone')
      .order('created_at', { ascending: false });

    const lead = (leads || []).find(l => {
      const lp = l.phone.replace(/[\s\-\(\)\+]/g, '').slice(-10);
      return lp === cleanPhone;
    });

    if (lead) {
      await sb.from('messages').insert({
        lead_id: lead.id,
        direction: 'inbound',
        body,
      });
    }

    return res.setHeader('Content-Type', 'text/xml').send('<Response></Response>');
  } catch (err) {
    console.error('Inbound SMS error:', err);
    return res.setHeader('Content-Type', 'text/xml').send('<Response></Response>');
  }
};
