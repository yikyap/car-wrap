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

// Load reference images once at cold start
const REFERENCE_IMAGES = [1, 2, 3, 4, 5, 6].map((i) => {
  const filePath = path.join(process.cwd(), "images", `matte-black-${i}.webp`);
  return {
    data: fs.readFileSync(filePath).toString("base64"),
    mimeType: "image/webp",
  };
});

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
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
          model: "gemini-2.0-flash-exp",
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { data: photo, mimeType } },
                { inlineData: { data: ref.data, mimeType: ref.mimeType } },
                {
                  text: `The first image is a customer's car. The second image is a reference showing the exact camera angle, lighting, and showroom background I want.

Generate a photorealistic image of the customer's exact car (same make, model, color, and any custom details) placed in the same dark showroom environment as the reference image. Match the exact camera angle and composition of the reference: ${ANGLE_PROMPTS[i]}.

The lighting should be dramatic and moody, matching the reference. The background should be a clean, dark studio/showroom. The car should look like a real photograph, not a rendering.`,
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ["IMAGE", "TEXT"],
          },
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
