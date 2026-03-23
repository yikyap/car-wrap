const { GoogleGenAI } = require("@google/genai");

const SYSTEM_MSG = `You are a car wrap advisor chatbot. 1-2 sentences max. Casual tone.

GATHERING CAR INFO — ask ONE question at a time in this order:
1. Year, make, model (they usually give this first — if they include a color like "white" or "black", that IS the body color, don't ask again)
2. If body color wasn't provided: "What color is the body?"
3. "What color are the rims?" (ask AFTER you have body color)
4. "What color is the trim?" (window trim, grille, mirror caps — e.g. chrome, gloss black, or body-colored. If they don't know, default to chrome)
5. Once you have make + model + body color + rim color + trim color, confirm:
   "Got it — a [color] [year] [make] [model] with [rim color] rims and [trim color] trim. Sound right? [GENERATE: year|make|model|body color|rim color|full description including trim color]"
   Example: [GENERATE: 2024|Tesla|Model 3|white|black|A 2024 Tesla Model 3 in white with black rims and chrome trim]

IMPORTANT: If the user says "2015 BMW 4 Series white" — "white" is the body color. Do NOT ask for body color again. Move straight to asking about rims.

AFTER CAR IS GENERATED — help them pick wrap colors:
- When they say a color, respond: "Nice — [color] [finish]. Want me to generate it? [RECOLOR: color | finish]"
- ALWAYS include [RECOLOR: color name | Finish] tag. Examples:
  [RECOLOR: Matte black | Matte]
  [RECOLOR: Ocean blue | Gloss]
  [RECOLOR: White | Gloss]
- If they don't specify a finish, default to Gloss.

CRITICAL RULES:
- NEVER combine body color and rim color into one question
- NEVER explain what a car is
- NEVER use bullet points or markdown
- ALWAYS include [GENERATE: year|make|model|body color|rim color|full description] tag when confirming car details
- ALWAYS include [RECOLOR: ... | ...] tag when user mentions a wrap color
- These tags are parsed by code — they MUST be included or the app breaks

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
          text: "Understood. I will ask body color and rim color as separate questions. I will ALWAYS include [GENERATE: ...] when confirming car details and [RECOLOR: ... | ...] when the user picks a wrap color. 1-2 sentences max.",
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

    // Check for [GENERATE: year|make|model|body_color|wheel_color|full description]
    const genMatch = reply.match(/\[GENERATE:\s*(.+?)\]/);
    if (genMatch) {
      const raw = genMatch[1].trim();
      const parts = raw.split("|").map(s => s.trim());
      let carDescription, cacheMetadata;

      if (parts.length >= 6) {
        // Structured format: year|make|model|body_color|wheel_color|description
        cacheMetadata = {
          year: parts[0],
          make: parts[1],
          model: parts[2],
          body_color: parts[3],
          wheel_color: parts[4],
        };
        carDescription = parts.slice(5).join("|"); // In case description contains pipes
      } else {
        // Fallback: old format, just a description string
        carDescription = raw;
        cacheMetadata = null;
      }

      actions.push({ type: "generate_car", carDescription, cacheMetadata });
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

    // Fallback: if no recolor tag but user is asking about a color
    // ONLY trigger after a car has been generated (indicated by a prior [GENERATE] action in conversation)
    const conversationText = messages.map(m => m.parts?.map(p => p.text || '').join(' ')).join(' ');
    const carWasGenerated = conversationText.toLowerCase().includes('your car is ready') || conversationText.toLowerCase().includes('what wrap color');
    if (actions.length === 0 && carWasGenerated) {
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
