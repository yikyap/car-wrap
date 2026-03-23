const { generateHeroOnly } = require("./_generate-images-openai");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { carDescription, userPhoto } = req.body;
  if (!carDescription) {
    return res.status(400).json({ error: "Missing carDescription" });
  }

  try {
    const heroB64 = await generateHeroOnly(carDescription, userPhoto || null);
    res.status(200).json({ image: { data: heroB64, mimeType: "image/png" } });
  } catch (err) {
    console.error("Hero generation error:", err);
    res.status(500).json({ error: err.message || "Hero generation failed" });
  }
};

module.exports.config = { maxDuration: 120 };
