const { generateRemainingAngles } = require("./_generate-images-openai");
const { saveToCache } = require("./_supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { carDescription, heroImage, userPhoto, cacheMetadata } = req.body;
  if (!carDescription || !heroImage) {
    return res.status(400).json({ error: "Missing carDescription or heroImage" });
  }

  try {
    const remaining = await generateRemainingAngles(carDescription, heroImage, userPhoto || null);

    // Save all 3 images (hero + remaining) to cache
    let cacheId = null;
    if (cacheMetadata) {
      const allImages = [{ data: heroImage, mimeType: "image/png" }, ...remaining];
      cacheId = await saveToCache(cacheMetadata, allImages, carDescription).catch(() => null);
    }

    res.status(200).json({ images: remaining, cacheId });
  } catch (err) {
    console.error("Remaining angles error:", err);
    res.status(500).json({ error: err.message || "Remaining generation failed" });
  }
};

module.exports.config = { maxDuration: 120 };
