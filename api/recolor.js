const { GoogleGenAI } = require("@google/genai");
const { generateImageWithRetry } = require("./_retry");
const fs = require("fs");
const path = require("path");

const ANGLE_PROMPTS = [
  "front view, straight on, headlights visible, low angle",
  "passenger side profile, full side view facing right",
  "rear view, straight on, taillights visible",
  "driver side profile, full side view facing left",
  "front three-quarter view from above, looking down at hood and driver side",
  "rear three-quarter view from above, looking down at trunk and passenger side",
];

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

  try {
    loadImages();
  } catch (err) {
    return res.status(500).json({ error: "Failed to load reference images: " + err.message });
  }

  const { carDescription, colorName, finishName } = req.body;
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
    const results = await Promise.all(
      REFERENCE_IMAGES.map((ref, i) =>
        generateImageWithRetry(ai, [
          { inlineData: { data: ref.data, mimeType: ref.mimeType } },
          { inlineData: { data: BG_IMAGE.data, mimeType: BG_IMAGE.mimeType } },
          {
            text: `Generate a photorealistic showroom image of the following car:

${carDescription}

IMPORTANT: Change the car's body color to ${colorName} with a ${finish} finish. Keep everything else about the car identical — same make, model, wheels, body shape, and all other details. Only the body paint color and finish should change.

Use the first image as a reference for the exact camera angle and composition: ${ANGLE_PROMPTS[i]}.
Use the second image as the exact showroom background — dark studio with subtle center spotlight on dark concrete floor.

The image should look like a professional car photograph, not a rendering. No text or watermarks.`,
          },
        ])
      )
    );

    const images = results.map((r) => {
      const parts = r.candidates?.[0]?.content?.parts || [];
      const imgPart = parts.find((p) => p.inlineData);
      if (!imgPart) throw new Error("No image in response");
      return {
        data: imgPart.inlineData.data,
        mimeType: imgPart.inlineData.mimeType,
      };
    });

    res.status(200).json({ images });
  } catch (err) {
    console.error("Gemini recolor error:", err);
    res.status(500).json({ error: err.message || "Recolor failed" });
  }
};

module.exports.config = {
  maxDuration: 60,
};
