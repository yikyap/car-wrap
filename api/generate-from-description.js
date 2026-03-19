const { GoogleGenAI } = require("@google/genai");
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
    const results = await Promise.all(
      REFERENCE_IMAGES.map((ref, i) =>
        ai.models.generateContent({
          model: "gemini-3.1-flash-image-preview",
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { data: ref.data, mimeType: ref.mimeType } },
                { inlineData: { data: BG_IMAGE.data, mimeType: BG_IMAGE.mimeType } },
                {
                  text: `Generate a photorealistic showroom image of the following car:

${carDescription}

Use the first image as a reference for the exact camera angle and composition: ${ANGLE_PROMPTS[i]}.
Use the second image as the exact showroom background — dark studio with subtle center spotlight on dark concrete floor.

The car must match the description exactly — same make, model, year, color, wheels, trim, and all details. The image should look like a professional car photograph, not a rendering. No text or watermarks.`,
                },
              ],
            },
          ],
        })
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

    res.status(200).json({ images, carDescription });
  } catch (err) {
    console.error("Gemini API error:", err);
    res.status(500).json({ error: err.message || "Generation failed" });
  }
};

module.exports.config = {
  maxDuration: 60,
};
