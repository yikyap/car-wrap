const { generateAllImages } = require("./_generate-images-openai");
const { saveToCache } = require("./_supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { carDescription, cacheMetadata } = req.body;
  if (!carDescription) {
    return res.status(400).json({ error: "Missing carDescription" });
  }

  try {
    const images = await generateAllImages(
      `Generate a photorealistic showroom image of the following car:\n\n${carDescription}\n\nThe car must match the description exactly — same make, model, year, color, wheels, trim, and all details.`
    );

    // Save to cache and return cacheId
    let cacheId = null;
    if (cacheMetadata) {
      cacheId = await saveToCache(cacheMetadata, images, carDescription).catch(() => null);
    }

    res.status(200).json({ images, carDescription, cacheId });
  } catch (err) {
    console.error("Generation error:", err);
    res.status(500).json({ error: err.message || "Generation failed" });
  }
};

module.exports.config = { maxDuration: 60 };
