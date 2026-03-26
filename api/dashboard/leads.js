const { getClient } = require('../_supabase');

module.exports = async (req, res) => {
  const sb = getClient();

  // GET — fetch all leads
  if (req.method === 'GET') {
    try {
      const status = req.query.status;
      let query = sb.from('leads').select('*').order('created_at', { ascending: false });
      if (status && status !== 'all') query = query.eq('status', status);
      const { data, error } = await query;
      if (error) return res.status(500).json({ error: String(error) });
      return res.json(data || []);
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  }

  // PATCH — update a lead
  if (req.method === 'PATCH') {
    try {
      const { id, ...fields } = req.body;
      if (!id) return res.status(400).json({ error: 'Missing id' });

      const allowed = ['status', 'notes', 'appointment_at', 'vehicle', 'name', 'phone', 'email', 'service', 'message'];
      const data = {};
      for (const key of allowed) {
        if (fields[key] !== undefined) {
          if (key === 'appointment_at') {
            data[key] = fields[key] ? new Date(fields[key]).toISOString() : null;
          } else {
            data[key] = fields[key];
          }
        }
      }
      // Also support camelCase appointmentAt from frontend
      if (fields.appointmentAt !== undefined) {
        data.appointment_at = fields.appointmentAt ? new Date(fields.appointmentAt).toISOString() : null;
      }

      const { data: lead, error } = await sb.from('leads').update(data).eq('id', id).select().single();
      if (error) return res.status(404).json({ error: 'Lead not found' });
      return res.json(lead);
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
