const { generateImageWithRetry } = require("./_retry");

const ANGLE_PROMPTS = [
  "front view, straight on, headlights visible, low angle",
  "passenger side profile, full side view facing right",
  "rear view, straight on, taillights visible",
  "driver side profile, full side view facing left",
  "front three-quarter view from above, looking down at hood and driver side",
  "rear three-quarter view from above, looking down at trunk and passenger side",
];

// Guardrails added to every image generation prompt
const GUARDRAILS = `

STRICT RULES — FOLLOW EXACTLY:
- Do NOT add any logos, brand emblems, text, letters, or symbols onto the car body
- Do NOT add watermarks, signatures, or overlay graphics of any kind
- Do NOT add badges, decals, or stickers that weren't in the description
- The car body must be CLEAN — only paint, no graphics
- Only show the car's actual factory badges in their correct positions (grille emblem, rear badge)
- Do NOT mix brands — a Toyota must have Toyota badges, a BMW must have BMW badges, etc.
- Do NOT reference or copy any other car in the provided images — only use them for background/lighting reference`;

async function generateAllImages(ai, bgImage, promptText, userPhoto) {
  const HERO_INDEX = 4;
  const fullPrompt = promptText + GUARDRAILS;

  // Step 1: Generate hero image — NO Tesla reference, just text + showroom bg
  console.log("Generating hero image (angle " + HERO_INDEX + ")...");
  const heroParts = [];

  if (userPhoto) {
    heroParts.push({ inlineData: { data: userPhoto.data, mimeType: userPhoto.mimeType } });
    heroParts.push({ inlineData: { data: bgImage.data, mimeType: bgImage.mimeType } });
    heroParts.push({
      text: `The first image is the customer's actual car — generate this EXACT car (same make, model, body shape, every design detail).
Use the second image ONLY as a reference for the showroom background and lighting — do NOT copy any car from it.
${fullPrompt}
Camera angle: ${ANGLE_PROMPTS[HERO_INDEX]}.`,
    });
  } else {
    heroParts.push({ inlineData: { data: bgImage.data, mimeType: bgImage.mimeType } });
    heroParts.push({
      text: `Use this image ONLY as a reference for the showroom background and lighting — do NOT copy any car from it.
${fullPrompt}
Camera angle: ${ANGLE_PROMPTS[HERO_INDEX]}.`,
    });
  }

  const heroResult = await generateImageWithRetry(ai, heroParts);
  const heroPartsResp = heroResult.candidates?.[0]?.content?.parts || [];
  const heroImg = heroPartsResp.find((p) => p.inlineData);
  if (!heroImg) throw new Error("No hero image in response");

  // Step 2: Verify hero image matches the description
  console.log("Verifying hero image...");
  const heroCheck = await verifyHero(ai, heroImg.inlineData, promptText);
  if (!heroCheck.pass) {
    console.log("Hero FAILED verification: " + heroCheck.reason + ". Regenerating...");
    const retryResult = await generateImageWithRetry(ai, heroParts);
    const retryParts = retryResult.candidates?.[0]?.content?.parts || [];
    const retryImg = retryParts.find((p) => p.inlineData);
    if (retryImg) {
      heroImg.inlineData = retryImg.inlineData;
      console.log("Hero regenerated.");
    }
  } else {
    console.log("Hero passed verification.");
  }

  console.log("Generating remaining 5 angles...");

  // Step 3: Generate remaining 5 angles — ONLY hero + showroom bg, NO Tesla reference
  const remainingIndices = [0, 1, 2, 3, 5];
  const remainingResults = await Promise.all(
    remainingIndices.map((i) => {
      const parts = [];
      if (userPhoto) {
        parts.push({ inlineData: { data: userPhoto.data, mimeType: userPhoto.mimeType } });
      }
      parts.push(
        { inlineData: { data: heroImg.inlineData.data, mimeType: heroImg.inlineData.mimeType } },
        { inlineData: { data: bgImage.data, mimeType: bgImage.mimeType } },
      );

      const imgCount = userPhoto ? 3 : 2;
      const heroRef = userPhoto
        ? "The first image is the customer's actual car. The second image is a showroom render of that SAME car — match it EXACTLY (same make, model, body shape, color, wheels)."
        : "The first image is the EXACT car you must reproduce — same make, model, color, wheels, body shape, every detail must be identical.";

      const bgRef = `Image ${imgCount} is the showroom background — use the same dark studio lighting and floor.`;

      parts.push({
        text: `${heroRef}
${bgRef}
${fullPrompt}

Camera angle for this image: ${ANGLE_PROMPTS[i]}.

CRITICAL: Generate the EXACT same car from the reference, just viewed from a different angle. Same body shape, same color, same wheels, same everything. Do NOT generate a different car.`,
      });

      return generateImageWithRetry(ai, parts);
    })
  );

  // Assemble all 6 images
  const allImages = new Array(6);
  allImages[HERO_INDEX] = {
    data: heroImg.inlineData.data,
    mimeType: heroImg.inlineData.mimeType,
  };

  remainingIndices.forEach((origIdx, resultIdx) => {
    const parts = remainingResults[resultIdx].candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find((p) => p.inlineData);
    if (!imgPart) throw new Error("No image in response for angle " + origIdx);
    allImages[origIdx] = {
      data: imgPart.inlineData.data,
      mimeType: imgPart.inlineData.mimeType,
    };
  });

  return allImages;
}

// Lightweight hero verification — checks if the generated car matches the description
async function verifyHero(ai, imgData, promptText) {
  try {
    // Extract car description from the prompt
    const descMatch = promptText.match(/following car:\s*\n\n(.+?)(?:\n\n|$)/s);
    const carDesc = descMatch ? descMatch[1].trim() : "";

    const parts = [
      { inlineData: { data: imgData.data, mimeType: imgData.mimeType } },
      { text: `Look at this car image. I asked for: "${carDesc}"

Answer YES or NO to each:
1. Is this the correct MAKE? (e.g., if I asked for BMW, is it a BMW and not a Tesla/Toyota/etc?)
2. Is this the correct general MODEL TYPE? (sedan vs coupe vs SUV etc)
3. Are there any wrong brand logos visible? (e.g. Tesla badge on a BMW)

Reply in this exact format:
CORRECT_MAKE: YES/NO
CORRECT_TYPE: YES/NO
WRONG_LOGO: YES/NO` },
    ];

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts }],
    });

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log("Hero verify: " + text.replace(/\n/g, " | "));

    const correctMake = /CORRECT_MAKE:\s*YES/i.test(text);
    const correctType = /CORRECT_TYPE:\s*YES/i.test(text);
    const wrongLogo = /WRONG_LOGO:\s*YES/i.test(text);

    if (!correctMake) return { pass: false, reason: "wrong car make" };
    if (!correctType) return { pass: false, reason: "wrong body type" };
    if (wrongLogo) return { pass: false, reason: "wrong brand logo" };

    return { pass: true, reason: "ok" };
  } catch (err) {
    console.log("Hero verification error, assuming pass:", err.message);
    return { pass: true, reason: "verification error" };
  }
}

module.exports = { generateAllImages, ANGLE_PROMPTS };
