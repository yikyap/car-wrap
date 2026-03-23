const { GoogleGenAI } = require("@google/genai");
const { generateAllImages } = require("./_generate-images-openai");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { photo, mimeType } = req.body;
  if (!photo || !mimeType) {
    return res.status(400).json({ error: "Missing photo or mimeType" });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  try {
    // Step 1: Analyze the uploaded photo with Gemini (fast + cheap for text analysis)
    const ai = new GoogleGenAI({ apiKey: geminiKey });
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

    // Step 2: Generate 6 showroom views with OpenAI GPT-Image-1.5
    const userPhoto = { data: photo, mimeType };
    const images = await generateAllImages(
      `Generate a photorealistic showroom image of the following car:\n\n${carDescription}\n\nThe car must match the description exactly — same make, model, color, wheels, and all details.`,
      userPhoto
    );

    res.status(200).json({ images, carDescription });
  } catch (err) {
    console.error("Generation error:", err);
    res.status(500).json({ error: err.message || "Generation failed" });
  }
};

module.exports.config = { maxDuration: 60 };
