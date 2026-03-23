const { generateAllImages } = require("./_generate-images-openai");
const { saveToCache } = require("./_supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { carDescription, colorName, finishName, userPhoto, cacheMetadata } = req.body;
  if (!carDescription || !colorName) {
    return res.status(400).json({ error: "Missing carDescription or colorName" });
  }

  const finish = finishName || "Gloss";

  try {
    const recolorPrompt = `Generate a photorealistic showroom image of the following car:\n\n${carDescription}\n\nIMPORTANT INSTRUCTIONS:\n1. The body panel paint color should be ${colorName} with a ${finish} finish.\n2. PRESERVE ALL TRIM EXACTLY AS DESCRIBED — the trim color (window surrounds, grille, mirror caps, bumper trim, door handles) must match what is specified in the car description above. If the description says "chrome trim", the trim MUST be chrome. If it says "gloss black trim", the trim MUST be gloss black. NEVER change trim color.\n3. PRESERVE WHEELS EXACTLY — same wheel color and style as described.\n4. Only the painted body panels (doors, fenders, hood, trunk, roof, quarter panels) should reflect the wrap color. Everything else stays identical to the description.`;

    const photoRef = userPhoto ? { data: userPhoto.data, mimeType: userPhoto.mimeType } : null;
    const images = await generateAllImages(recolorPrompt, photoRef);

    // Save to cache and return cacheId
    let cacheId = null;
    if (cacheMetadata) {
      const meta = { ...cacheMetadata, body_color: colorName + (finishName ? ` ${finishName}` : "") };
      cacheId = await saveToCache(meta, images, carDescription).catch(() => null);
    }

    res.status(200).json({ images, cacheId });
  } catch (err) {
    console.error("Recolor error:", err);
    res.status(500).json({ error: err.message || "Recolor failed" });
  }
};

module.exports.config = { maxDuration: 60 };
