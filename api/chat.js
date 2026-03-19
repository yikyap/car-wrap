const { GoogleGenAI } = require("@google/genai");

const SYSTEM_PROMPT = `You are a car wrap advisor chatbot. Keep all responses to 1-2 sentences. Be casual — think texting, not email.

YOUR FLOW:
1. First, ask what car they want wrapped.
2. When they tell you the car (e.g. "Tesla Model 3"), start gathering details one question at a time:
   - What year?
   - What's the current body color?
   - What color are the rims/wheels?
   - Any special trim, badges, or modifications?
   Keep each question short and natural. Don't ask all at once.
3. Once you have enough details (at minimum: make, model, year, current color, rim color), call generate_car to create their car in the showroom. Summarize what you're generating.
4. After the car is generated, ask what wrap color/finish they'd like to see. Suggest some options.
5. When they pick a color, call recolor_car immediately.
6. If they upload a photo instead of describing their car, call generate_views to use their photo directly.

IMPORTANT: Do NOT ask for information you already have. If they say "2015 BMW 4 series gran coupe" you already have the make, model, and year — just ask about color and rims next.

Available wrap colors: Pearl white, Matte black, Matte red, Sunflower, Ocean blue, British green, Burnt orange, Royal purple, Gunmetal, Rose gold. Also any custom color.

Finishes: Gloss ($2,200), Matte ($2,300), Satin ($2,350), Chrome ($2,800).

Wrap facts (only if asked): Gloss lasts 5-7yr, Matte/Satin 3-5yr, Chrome 2-3yr. Hand wash only. Protects original paint. 2-5 day install. Removable.`;

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "generate_car",
        description:
          "Generate 6 showroom views of the customer's car based on their description. Call this once you have enough details about their car (make, model, year, color, rim color).",
        parameters: {
          type: "object",
          properties: {
            carDescription: {
              type: "string",
              description:
                'A detailed description of the car including make, model, year, body color, rim/wheel color, trim level, and any modifications. E.g. "2015 BMW 4 Series Gran Coupe (F36) in Mineral Grey metallic with 19-inch silver M Sport alloy wheels, M Sport package, black kidney grille"',
            },
          },
          required: ["carDescription"],
        },
      },
      {
        name: "generate_views",
        description:
          "Generate 6 showroom views from a photo the customer uploaded. Call this when they attach a photo of their car.",
        parameters: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "recolor_car",
        description:
          "Change the wrap color and finish on the customer's car. Only call after generate_car or generate_views has been used.",
        parameters: {
          type: "object",
          properties: {
            colorName: {
              type: "string",
              description: "The wrap color to apply",
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
      {
        name: "switch_color",
        description:
          "Switch the visualizer to a preset color (before a custom car is generated). Use for browsing the default Tesla Model 3 previews.",
        parameters: {
          type: "object",
          properties: {
            colorName: {
              type: "string",
              description: "The color name from the preset list",
            },
          },
          required: ["colorName"],
        },
      },
      {
        name: "switch_finish",
        description: "Switch the wrap finish type.",
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
    ],
  },
];

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { messages } = req.body;
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
