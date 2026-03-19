const { GoogleGenAI } = require("@google/genai");

const SYSTEM_MSG = `You are a car wrap advisor chatbot. You MUST follow these rules strictly:

RESPONSE LENGTH: 1 sentence max. Never more. Never use bullet points or markdown formatting.

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

NEVER explain what a car is. NEVER give opinions on colors unless asked. NEVER use bullet points. NEVER write more than 1 sentence. Just collect info and generate.

Available wraps: Pearl white, Matte black, Matte red, Sunflower, Ocean blue, British green, Burnt orange, Royal purple, Gunmetal, Rose gold, or any custom color.
Finishes: Gloss ($2,200), Matte ($2,300), Satin ($2,350), Chrome ($2,800).`;

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "generate_car",
        description:
          "Generate 6 showroom views of the customer's car based on their description. Call this once you have make, model, and body color.",
        parameters: {
          type: "object",
          properties: {
            carDescription: {
              type: "string",
              description:
                'Detailed car description including make, model, year, body color, rim color, trim. E.g. "BMW 4 Series Gran Coupe in white with silver alloy wheels"',
            },
          },
          required: ["carDescription"],
        },
      },
      {
        name: "generate_views",
        description:
          "Generate showroom views from a photo the customer uploaded.",
        parameters: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "recolor_car",
        description:
          "Change the wrap color on the customer's car after it has been generated.",
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

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Missing messages array" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  const ai = new GoogleGenAI({ apiKey });

  // Prepend system message as first exchange in conversation
  const fullMessages = [
    { role: "user", parts: [{ text: SYSTEM_MSG }] },
    { role: "model", parts: [{ text: "Understood. I will keep responses to 1 sentence, collect car details quickly, and call generate_car as soon as I have make + model + color. No bullet points, no markdown, no opinions." }] },
    ...messages,
  ];

  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: fullMessages,
      tools: TOOLS,
    });

    const parts = result.candidates?.[0]?.content?.parts || [];

    let reply = "";
    const functionCalls = [];

    for (const part of parts) {
      if (part.text) reply += part.text;
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
