const { GoogleGenAI } = require("@google/genai");

module.exports = async function handler(req, res) {
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
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { data: photo, mimeType } },
            {
              text: `What color is shown in this image? Describe it as a car paint color name that a wrap shop would understand. Be specific about the shade, tone, and finish.

Examples of good responses:
- "Midnight purple metallic"
- "Nardo gray matte"
- "Miami blue pearl"
- "British racing green gloss"
- "Frozen berry metallic"

Respond with ONLY the color name, nothing else.`,
            },
          ],
        },
      ],
    });

    const colorName =
      result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "Unknown";

    res.status(200).json({ colorName });
  } catch (err) {
    console.error("Color analysis error:", err);
    res.status(500).json({ error: err.message || "Analysis failed" });
  }
};
