const { GoogleGenAI } = require("@google/genai");

const SYSTEM_PROMPT = `You are a car wrap advisor chatbot. You MUST follow these rules strictly:

RESPONSE LENGTH: 1 sentence max. Never more. Never use bullet points or markdown.

YOUR ONLY JOB:
1. Collect car details from the customer (make, model, color, rim color).
2. As soon as you have make + model + body color, call generate_car IMMEDIATELY. Do NOT keep chatting. Fill in reasonable defaults for anything missing (e.g. silver rims if not specified).
3. After generating, ask what wrap color they want. When they answer, call recolor_car IMMEDIATELY.
4. If they upload a photo, call generate_views IMMEDIATELY.

EXAMPLES OF CORRECT BEHAVIOR:
- User: "BMW 4 series white" → You have make, model, color. Call generate_car right now with "BMW 4 Series in white with silver alloy wheels". Reply: "Generating your white BMW 4 Series now!"
- User: "Tesla Model 3" → Missing color. Reply: "What color is your Model 3?"
- User: "Black" → Now you have enough. Call generate_car. Reply: "Got it, generating your black Model 3!"
- User: "Show me matte red" → Call recolor_car. Reply: "Switching to matte red!"

NEVER explain what a car is. NEVER give opinions on colors unless asked. NEVER use bullet points. Just collect info and generate.

Available wraps: Pearl white, Matte black, Matte red, Sunflower, Ocean blue, British green, Burnt orange, Royal purple, Gunmetal, Rose gold, or any custom color.
Finishes: Gloss ($2,200), Matte ($2,300), Satin ($2,350), Chrome ($2,800).`;

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
