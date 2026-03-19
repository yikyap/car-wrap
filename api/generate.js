const { GoogleGenAI } = require("@google/genai");
const { generateImageWithRetry } = require("./_retry");
const fs = require("fs");
const path = require("path");

// Descriptions for each angle to guide generation
const ANGLE_PROMPTS = [
  "front view, straight on, headlights visible, low angle",
  "passenger side profile, full side view facing right",
  "rear view, straight on, taillights visible",
  "driver side profile, full side view facing left",
  "front three-quarter view from above, looking down at hood and driver side",
  "rear three-quarter view from above, looking down at trunk and passenger side",
];

// Lazy-load images on first request
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
    console.error("Failed to load reference images:", err);
    return res.status(500).json({ error: "Failed to load reference images: " + err.message });
  }

  const { photo, mimeType } = req.body;
  if (!photo || !mimeType) {
    return res.status(400).json({ error: "Missing photo or mimeType" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    // Step 1: Analyze the uploaded photo to identify the car
    const analysisResult = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { data: photo, mimeType } },
            {
              text: `Analyze this car photo and provide a detailed description. Be specific and concise. Include:

1. Make and model (e.g. "2024 BMW M4 Competition")
2. Trim/variant if identifiable
3. Body color (exact shade, e.g. "Isle of Man Green metallic")
4. Wheel/rim style and color (e.g. "19-inch black M Sport alloy wheels")
5. Any aftermarket or custom modifications visible (body kit, spoiler, tinted windows, wrap, decals, etc.)
6. Notable design details (grille style, headlight shape, body lines)

Respond with ONLY a single paragraph description, no bullet points or labels. Be as specific as possible about the exact car.`,
            },
          ],
        },
      ],
    });

    const carDescription =
      analysisResult.candidates?.[0]?.content?.parts?.[0]?.text || "a car";
    console.log("Car identified as:", carDescription);

    // Step 2: Generate 6 showroom views using the description
    const results = await Promise.all(
      REFERENCE_IMAGES.map((ref, i) =>
        generateImageWithRetry(ai, [
          { inlineData: { data: ref.data, mimeType: ref.mimeType } },
          { inlineData: { data: BG_IMAGE.data, mimeType: BG_IMAGE.mimeType } },
          {
            text: `Generate a photorealistic showroom image of the following car:

${carDescription}

Use the first image as a reference for the exact camera angle and composition: ${ANGLE_PROMPTS[i]}.
Use the second image as the exact showroom background — dark studio with subtle center spotlight on dark concrete floor.

The car must match the description exactly — same make, model, color, wheels, and all details. The image should look like a professional car photograph, not a rendering. No text or watermarks.`,
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

    res.status(200).json({ images, carDescription });
  } catch (err) {
    console.error("Gemini API error:", err);
    res.status(500).json({ error: err.message || "Generation failed" });
  }
};

module.exports.config = {
  maxDuration: 60,
};
