import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";

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

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
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
    const results = await Promise.all(
      REFERENCE_IMAGES.map((ref, i) =>
        ai.models.generateContent({
          model: "gemini-3.1-flash-image-preview",
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { data: photo, mimeType } },
                { inlineData: { data: ref.data, mimeType: ref.mimeType } },
                { inlineData: { data: BG_IMAGE.data, mimeType: BG_IMAGE.mimeType } },
                {
                  text: `I'm providing three images:
1. A customer's car photo
2. A reference image showing the exact camera angle and composition I want
3. The exact showroom background to use

Generate a photorealistic image of the customer's exact car (same make, model, color, and any custom details) placed in the showroom background from image 3. Match the exact camera angle and composition of image 2: ${ANGLE_PROMPTS[i]}.

The lighting should be dramatic and moody with a subtle center spotlight on the dark concrete floor, exactly matching the showroom background provided. The car should look like a real photograph, not a rendering.`,
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
    console.error("Gemini API error:", err);
    res.status(500).json({ error: err.message || "Generation failed" });
  }
}
