const { GoogleGenAI } = require("@google/genai");
const { generateAllImages } = require("./_generate-images");
const fs = require("fs");
const path = require("path");

let BG_IMAGE = null;

function loadBgImage() {
  if (BG_IMAGE) return;
  const imgDir = path.join(process.cwd(), "images");
  BG_IMAGE = {
    data: fs.readFileSync(path.join(imgDir, "showroom-bg.webp")).toString("base64"),
    mimeType: "image/webp",
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try { loadBgImage(); } catch (err) {
    return res.status(500).json({ error: "Failed to load background image: " + err.message });
  }

  const { carDescription, colorName, finishName, userPhoto } = req.body;
  if (!carDescription || !colorName) {
    return res.status(400).json({ error: "Missing carDescription or colorName" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  const ai = new GoogleGenAI({ apiKey });
  const finish = finishName || "Gloss";

  try {
    const photoRef = userPhoto ? { data: userPhoto.data, mimeType: userPhoto.mimeType } : null;
    const images = await generateAllImages(
      ai, BG_IMAGE,
      `Generate a photorealistic showroom image of the following car:\n\n${carDescription}\n\nIMPORTANT: Change the car's body color to ${colorName} with a ${finish} finish. Keep everything else identical — same make, model, wheels, body shape, and all other details. Only the body paint color and finish should change.\n\nDark studio showroom with subtle center spotlight on dark concrete floor. Professional car photograph, not a rendering.`,
      photoRef
    );

    res.status(200).json({ images });
  } catch (err) {
    console.error("Gemini recolor error:", err);
    res.status(500).json({ error: err.message || "Recolor failed" });
  }
};

module.exports.config = { maxDuration: 60 };
