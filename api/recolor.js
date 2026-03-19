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

  const { carDescription, colorName, finishName, patternName, zoneName } = req.body;
  if (!carDescription || !colorName) {
    return res.status(400).json({ error: "Missing carDescription or colorName" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  const ai = new GoogleGenAI({ apiKey });
  const finish = finishName || "Gloss";
  const pattern = patternName && patternName !== "None" ? patternName : null;
  const zone = zoneName || "Full body";

  try {
    // Step 1: If pattern requested, generate a precise pattern spec first
    let patternSpec = "";
    if (pattern) {
      const specResult = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `You are a car wrap designer. A customer wants a ${pattern} pattern applied to the ${zone.toLowerCase()} of their car (${carDescription}) in ${colorName} ${finish}.

Write a very precise, detailed description of exactly how this pattern should look on this specific car. Include:
- Exact colors used in the pattern (e.g. "dark charcoal gray #333 and matte black #111")
- Exact dimensions and scale of pattern elements (e.g. "each stripe is 4 inches wide with 2 inch gaps")
- Exact placement on the car body (e.g. "two parallel stripes running from the center of the front bumper, up the hood center, over the roof center, and down to the rear bumper")
- How the pattern transitions at body panel edges, curves, and seams
- What parts of the car are NOT covered by the pattern

Be extremely specific so that 6 different artists could each draw this from a different angle and it would look consistent. Write one detailed paragraph, no bullet points.`,
              },
            ],
          },
        ],
      });

      patternSpec =
        specResult.candidates?.[0]?.content?.parts?.[0]?.text || "";
      console.log("Pattern spec:", patternSpec);
    }

    // Step 2: Generate 6 views with the consistent pattern spec
    const patternInstruction = patternSpec
      ? `\n\nPATTERN DESIGN (follow this exactly for consistency across all views):\n${patternSpec}`
      : "";

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

IMPORTANT: Change the car's body color to ${colorName} with a ${finish} finish. Keep everything else about the car identical — same make, model, wheels, body shape, and all other details.${patternInstruction}

Use the first image as a reference for the exact camera angle and composition: ${ANGLE_PROMPTS[i]}.
Use the second image as the exact showroom background — dark studio with subtle center spotlight on dark concrete floor.

The image should look like a professional car photograph, not a rendering. No text or watermarks.`,
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

    res.status(200).json({ images });
  } catch (err) {
    console.error("Gemini recolor error:", err);
    res.status(500).json({ error: err.message || "Recolor failed" });
  }
};

module.exports.config = {
  maxDuration: 60,
};
