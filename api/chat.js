const { GoogleGenAI } = require("@google/genai");

const SYSTEM_PROMPT = `You are a car wrap advisor chatbot for a wrap visualization tool. Your ONLY job is to help customers visualize wraps on their car.

RULES:
- Keep ALL responses to 1-2 sentences MAX. Never write paragraphs.
- Do NOT explain what a car is. Do NOT give car history or specs.
- Stay focused on WRAPS: colors, finishes, pricing, and the visualizer.
- When a user tells you their car, acknowledge it briefly and ask what color or finish they want to see, or suggest they upload a photo.
- When a user wants to see a color, call switch_color immediately.
- When they want a different finish, call switch_finish immediately.
- When they upload a photo, call generate_views immediately.
- When they have a custom car and want a new color, call recolor_car.
- Be casual and brief. Think texting, not email.

Available colors: Pearl white, Matte black, Matte red, Sunflower, Ocean blue, British green, Burnt orange, Royal purple, Gunmetal, Rose gold. You can also do any custom color.

Finishes: Gloss ($2,200), Matte ($2,300), Satin ($2,350), Chrome ($2,800).

Quick wrap facts (only share if asked): Gloss lasts 5-7yr, Matte/Satin 3-5yr, Chrome 2-3yr. Hand wash only. Protects original paint. Installation takes 2-5 days. Removable without damage.`;

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "switch_color",
        description:
          "Switch the visualizer to show a different wrap color. Use for both preset colors and custom colors.",
        parameters: {
          type: "object",
          properties: {
            colorName: {
              type: "string",
              description:
                'The color name — either a preset (e.g. "Pearl white", "Matte black") or a custom color description (e.g. "midnight purple metallic")',
            },
          },
          required: ["colorName"],
        },
      },
      {
        name: "switch_finish",
        description:
          "Switch the wrap finish type. Affects price and appearance.",
        parameters: {
          type: "object",
          properties: {
            finishName: {
              type: "string",
              enum: ["Gloss", "Matte", "Satin", "Chrome"],
              description: "The finish type",
            },
          },
          required: ["finishName"],
        },
      },
      {
        name: "generate_views",
        description:
          "Generate 6 showroom views of the customer's uploaded car. Call this after the user uploads a photo of their car.",
        parameters: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "recolor_car",
        description:
          "Recolor a previously uploaded custom car to a new color and finish. Only works after generate_views has been called.",
        parameters: {
          type: "object",
          properties: {
            colorName: {
              type: "string",
              description: "The color to apply",
            },
            finishName: {
              type: "string",
              enum: ["Gloss", "Matte", "Satin", "Chrome"],
              description: "The finish type",
            },
          },
          required: ["colorName"],
        },
      },
    ],
  },
];

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { messages, hasCustomCar } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Missing messages array" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      systemInstruction: SYSTEM_PROMPT,
      contents: messages,
      tools: TOOLS,
    });

    const parts = result.candidates?.[0]?.content?.parts || [];

    // Extract text and function calls
    let reply = "";
    const functionCalls = [];

    for (const part of parts) {
      if (part.text) {
        reply += part.text;
      }
      if (part.functionCall) {
        functionCalls.push({
          name: part.functionCall.name,
          args: part.functionCall.args || {},
        });
      }
    }

    res.status(200).json({ reply, functionCalls });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: err.message || "Chat failed" });
  }
};
