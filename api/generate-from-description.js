const { GoogleGenAI } = require("@google/genai");
const { generateAllImages } = require("./_generate-images");
const fs = require("fs");
const path = require("path");

let BG_IMAGE = null;
let REFERENCE_IMAGES = null;

function loadImages() {
  if (REFERENCE_IMAGES) return;
  const imgDir = path.join(process.cwd(), "images");
  BG_IMAGE = {
    data: fs.readFileSync(path.join(imgDir, "showroom-bg.webp")).toString("base64"),
    mimeType: "image/webp",
  };
  REFERENCE_IMAGES = [1, 2, 3, 4, 5, 6].map((i) => ({
    data: fs.readFileSync(path.join(imgDir, `matte-black-${i}.webp`)).toString("base64"),
    mimeType: "image/webp",
  }));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try { loadImages(); } catch (err) {
    return res.status(500).json({ error: "Failed to load reference images: " + err.message });
  }

  const { carDescription } = req.body;
  if (!carDescription) {
    return res.status(400).json({ error: "Missing carDescription" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const images = await generateAllImages(
      ai, REFERENCE_IMAGES, BG_IMAGE,
      `Generate a photorealistic showroom image of the following car:\n\n${carDescription}\n\nThe car must match the description exactly — same make, model, year, color, wheels, trim, and all details. Dark studio showroom with subtle center spotlight on dark concrete floor. Professional car photograph, not a rendering.`
    );

    res.status(200).json({ images, carDescription });
  } catch (err) {
    console.error("Gemini API error:", err);
    res.status(500).json({ error: err.message || "Generation failed" });
  }
};

module.exports.config = { maxDuration: 60 };
