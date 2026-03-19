const { GoogleGenAI } = require("@google/genai");

const SYSTEM_PROMPT = `You are a friendly, knowledgeable car wrap advisor for a premium wrap visualization tool. You help customers choose the perfect wrap for their vehicle.

Available wrap colors: Pearl white, Matte black, Matte red, Sunflower, Ocean blue, British green, Burnt orange, Royal purple, Gunmetal, Rose gold. You can also apply any custom color the user describes.

Available finishes: Gloss (base price), Matte (+$100), Satin (+$150), Chrome (+$600).
Base wrap price: $2,200 (varies by finish).

Wrap knowledge:
- Gloss wraps last 5-7 years with proper care
- Matte and satin wraps last 3-5 years
- Chrome wraps are most expensive and require extra care, last 2-3 years
- Always hand wash — no automatic car washes
- Wraps protect the original paint underneath
- Professional installation takes 2-5 days depending on vehicle complexity
- Wraps can be removed without damaging original paint
- Price ranges from $2,200-$5,000+ depending on vehicle size and material

When a user wants to see a color, call switch_color. When they want a different finish, call switch_finish. When they upload a photo of their car, call generate_views. When they have a custom car loaded and want to change its color, call recolor_car.

Be conversational and concise. Don't be overly salesy. If they ask about something you don't know, be honest. Keep responses to 1-3 sentences unless they ask for detailed information.`;

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
