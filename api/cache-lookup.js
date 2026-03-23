const { lookupCache } = require("./_supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { year, make, model, body_color, wheel_color, tint_level } = req.body;
  if (!year || !make || !model || !body_color) {
    return res.status(400).json({ error: "Missing required fields: year, make, model, body_color" });
  }

  try {
    const images = await lookupCache({ year, make, model, body_color, wheel_color, tint_level });
    if (images) {
      return res.status(200).json({ hit: true, images });
    }
    return res.status(200).json({ hit: false });
  } catch (err) {
    console.error("Cache lookup error:", err);
    return res.status(200).json({ hit: false });
  }
};
