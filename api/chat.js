const { GoogleGenAI } = require("@google/genai");

const SYSTEM_MSG = `You are a car wrap advisor chatbot. Keep responses to 1-2 sentences max. Be casual.

YOUR JOB:
1. Collect car details: make, model, year, body color, rim color.
2. Once you have enough info (at minimum make + model + color), respond with a confirmation like: "Got it — a white 2015 BMW 4 Series Gran Coupe with silver rims. Sound right?"
3. Always end the confirmation with "Sound right?" or "Does that look right?" so the customer can confirm.
4. After they confirm and the car is generated, help them pick wrap colors. Suggest options.
5. When they pick a color, respond with exactly this format: [RECOLOR: color name | finish name] — e.g. [RECOLOR: Matte red | Matte] or [RECOLOR: Ocean blue | Gloss]. Always include this tag when the user wants to change color.

RULES:
- Never explain what a car is or give car history
- Never use bullet points or markdown
- If they give you make + model + color in one message, go straight to confirmation
- Fill in reasonable defaults (e.g. silver rims if not specified, current year if not specified)
- For the confirmation, always include: year, make, model, body color, rim color

When confirming, also include a [GENERATE: description] tag at the end of your message with the full car description. Example:
"Got it — a white 2015 BMW 4 Series Gran Coupe with silver alloy wheels. Sound right? [GENERATE: 2015 BMW 4 Series Gran Coupe (F36) in Alpine White with silver alloy wheels]"

Available wraps: Pearl white, Matte black, Matte red, Sunflower, Ocean blue, British green, Burnt orange, Royal purple, Gunmetal, Rose gold, or any custom color.
Finishes: Gloss ($2,200), Matte ($2,300), Satin ($2,350), Chrome ($2,800).`;

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

  const fullMessages = [
    { role: "user", parts: [{ text: SYSTEM_MSG }] },
    {
      role: "model",
      parts: [
        {
          text: "Understood. I'll collect car details, confirm with the customer, use [GENERATE: ...] tags for car generation and [RECOLOR: ... | ...] tags for color changes. Short responses only.",
        },
      ],
    },
    ...messages,
  ];

  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: fullMessages,
    });

    let reply =
      result.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I didn't catch that.";

    // Parse out action tags
    const actions = [];

    // Check for [GENERATE: ...]
    const genMatch = reply.match(/\[GENERATE:\s*(.+?)\]/);
    if (genMatch) {
      actions.push({ type: "generate_car", carDescription: genMatch[1].trim() });
      reply = reply.replace(genMatch[0], "").trim();
    }

    // Check for [RECOLOR: color | finish]
    const recolorMatch = reply.match(/\[RECOLOR:\s*(.+?)\s*\|\s*(.+?)\]/);
    if (recolorMatch) {
      actions.push({
        type: "recolor_car",
        colorName: recolorMatch[1].trim(),
        finishName: recolorMatch[2].trim(),
      });
      reply = reply.replace(recolorMatch[0], "").trim();
    }

    // Fallback: if no recolor tag but user is asking about a color after car was generated,
    // try to detect color intent from the last user message
    if (actions.length === 0 && messages.length >= 4) {
      const lastUserMsg = messages
        .filter((m) => m.role === "user")
        .pop();
      const lastUserText = (lastUserMsg?.parts || [])
        .map((p) => p.text || "")
        .join(" ")
        .toLowerCase();

      const allColors = [
        "pearl white", "matte black", "matte red", "sunflower",
        "ocean blue", "british green", "burnt orange", "royal purple",
        "gunmetal", "rose gold",
      ];
      const allFinishes = ["gloss", "matte", "satin", "chrome"];

      // Check if user mentioned a color
      let detectedColor = null;
      let detectedFinish = "Gloss";

      for (const c of allColors) {
        if (lastUserText.includes(c)) { detectedColor = c; break; }
      }

      // Check for color words even if not in preset list
      if (!detectedColor) {
        const colorWords = ["black", "white", "red", "blue", "green", "orange", "purple", "grey", "gray", "gold", "silver", "pink", "yellow", "brown", "bronze", "teal", "navy", "maroon", "cream", "beige", "charcoal"];
        for (const w of colorWords) {
          if (lastUserText.includes(w)) {
            // Extract the color phrase from the reply or user message
            detectedColor = lastUserText.replace(/i('d| would) (like|want|love) (to see |to try |)?(a |it in |)/gi, "").trim();
            break;
          }
        }
      }

      for (const f of allFinishes) {
        if (lastUserText.includes(f)) { detectedFinish = f.charAt(0).toUpperCase() + f.slice(1); break; }
      }

      if (detectedColor) {
        // Capitalize color name
        const colorName = detectedColor.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        actions.push({ type: "recolor_car", colorName, finishName: detectedFinish });
        console.log("Fallback recolor detected:", colorName, detectedFinish);
      }
    }

    res.status(200).json({ reply, actions });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: err.message || "Chat failed" });
  }
};
