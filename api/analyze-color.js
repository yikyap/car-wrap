const OpenAI = require("openai");

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  return new OpenAI({ apiKey });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { photo, mimeType } = req.body;
  if (!photo || !mimeType) {
    return res.status(400).json({ error: "Missing photo or mimeType" });
  }

  try {
    const client = getClient();

    const result = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${photo}` } },
            {
              type: "text",
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
      max_tokens: 30,
    });

    const colorName = result.choices?.[0]?.message?.content?.trim() || "Unknown";
    res.status(200).json({ colorName });
  } catch (err) {
    console.error("Color analysis error:", err);
    res.status(500).json({ error: err.message || "Analysis failed" });
  }
};
