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
- Do NOT mix brands — a Toyota must have Toyota badges, a BMW must have BMW badges, etc.`;

async function generateAllImages(ai, referenceImages, bgImage, promptText, userPhoto) {
  const HERO_INDEX = 4;
  const fullPrompt = promptText + GUARDRAILS;

  // Step 1: Generate hero image
  console.log("Generating hero image (angle " + HERO_INDEX + ")...");
  const heroParts = [
    { inlineData: { data: referenceImages[HERO_INDEX].data, mimeType: referenceImages[HERO_INDEX].mimeType } },
    { inlineData: { data: bgImage.data, mimeType: bgImage.mimeType } },
  ];
  if (userPhoto) {
    heroParts.unshift({ inlineData: { data: userPhoto.data, mimeType: userPhoto.mimeType } });
    heroParts.push({
      text: `The first image is the customer's actual car — match this car EXACTLY (same make, model, body shape, design details).
${fullPrompt}
Camera angle: ${ANGLE_PROMPTS[HERO_INDEX]}.
Use the angle reference and showroom background provided.`,
    });
  } else {
    heroParts.push({
      text: fullPrompt + "\n\nCamera angle: " + ANGLE_PROMPTS[HERO_INDEX] + ".",
    });
  }

  const heroResult = await generateImageWithRetry(ai, heroParts);
  const heroPartsResp = heroResult.candidates?.[0]?.content?.parts || [];
  const heroImg = heroPartsResp.find((p) => p.inlineData);
  if (!heroImg) throw new Error("No hero image in response");

  // Verify hero image itself for artifacts
  const heroCheck = await verifyImage(ai, heroImg.inlineData, null);
  if (!heroCheck.pass) {
    console.log("Hero image failed verification: " + heroCheck.reason + ". Regenerating...");
    const retryResult = await generateImageWithRetry(ai, heroParts);
    const retryParts = retryResult.candidates?.[0]?.content?.parts || [];
    const retryImg = retryParts.find((p) => p.inlineData);
    if (retryImg) {
      heroImg.inlineData = retryImg.inlineData;
    }
  }

  console.log("Hero image generated. Generating remaining 5 angles...");

  // Step 2: Generate remaining 5 angles
  const remainingIndices = [0, 1, 2, 3, 5];
  const remainingResults = await Promise.all(
    remainingIndices.map((i) => {
      const parts = [];
      if (userPhoto) {
        parts.push({ inlineData: { data: userPhoto.data, mimeType: userPhoto.mimeType } });
      }
      parts.push(
        { inlineData: { data: heroImg.inlineData.data, mimeType: heroImg.inlineData.mimeType } },
        { inlineData: { data: referenceImages[i].data, mimeType: referenceImages[i].mimeType } },
        { inlineData: { data: bgImage.data, mimeType: bgImage.mimeType } },
      );

      const photoRef = userPhoto
        ? "The first image is the customer's actual car. The second image is a generated showroom view of that SAME car — match it exactly."
        : "The first image is the EXACT car you must match — same make, model, color, wheels, every detail must be identical.";

      const angleRef = userPhoto
        ? "The third image shows the camera angle to match: " + ANGLE_PROMPTS[i] + ". The fourth image is the showroom background."
        : "The second image shows the camera angle to match: " + ANGLE_PROMPTS[i] + ". The third image is the showroom background.";

      parts.push({
        text: `${photoRef}
${angleRef}
${fullPrompt}

CRITICAL: The car must be the EXACT same make, model, and body shape as the reference. Not a similar car — the SAME car from a different angle.`,
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

  // Step 3: Verify all images for consistency AND artifacts
  console.log("Verifying all images...");
  const verifyResults = await Promise.all(
    allImages.map((img, i) => {
      if (i === HERO_INDEX) return Promise.resolve({ pass: true, index: i });
      return verifyImage(ai, img, heroImg.inlineData).then((r) => ({ ...r, index: i }));
    })
  );

  // Step 4: Regenerate failures
  const failures = verifyResults.filter((v) => !v.pass);
  if (failures.length > 0) {
    console.log(`Regenerating ${failures.length} images: ${failures.map(f => 'angle ' + f.index + ' (' + f.reason + ')').join(', ')}`);
    const regenResults = await Promise.all(
      failures.map((f) => {
        const i = f.index;
        const parts = [];
        if (userPhoto) {
          parts.push({ inlineData: { data: userPhoto.data, mimeType: userPhoto.mimeType } });
        }
        parts.push(
          { inlineData: { data: heroImg.inlineData.data, mimeType: heroImg.inlineData.mimeType } },
          { inlineData: { data: referenceImages[i].data, mimeType: referenceImages[i].mimeType } },
          { inlineData: { data: bgImage.data, mimeType: bgImage.mimeType } },
        );

        parts.push({
          text: `IMPORTANT: A previous generation had this issue: ${f.reason}. Fix it this time.
${userPhoto ? "The first image is the customer's actual car. The second is the correct car in a showroom." : "The first image is the correct car."}
Match this car's body shape, headlights, grille, and every design detail exactly. Show it from this angle: ${ANGLE_PROMPTS[i]}.
${fullPrompt}`,
        });

        return generateImageWithRetry(ai, parts);
      })
    );

    regenResults.forEach((result, idx) => {
      const i = failures[idx].index;
      const parts = result.candidates?.[0]?.content?.parts || [];
      const imgPart = parts.find((p) => p.inlineData);
      if (imgPart) {
        allImages[i] = { data: imgPart.inlineData.data, mimeType: imgPart.inlineData.mimeType };
        console.log(`Angle ${i} regenerated.`);
      }
    });
  }

  return allImages;
}

// Verify a single image for quality issues
async function verifyImage(ai, imgData, heroData) {
  try {
    const parts = [];
    if (heroData) {
      parts.push({ inlineData: { data: heroData.data, mimeType: heroData.mimeType } });
    }
    parts.push({ inlineData: { data: imgData.data, mimeType: imgData.mimeType } });

    const prompt = heroData
      ? `Check these two car images for issues. Answer each question with YES or NO:
1. Are both images the same make and model of car (same body shape, design)?
2. Does the second image have any wrong brand logos (e.g. a Tesla logo on a Toyota)?
3. Does the second image have any large text, watermarks, or graphics overlaid on the car body?
4. Does the second image have any major distortions or artifacts?

Reply in this exact format:
SAME_CAR: YES/NO
WRONG_LOGO: YES/NO
TEXT_OVERLAY: YES/NO
DISTORTION: YES/NO`
      : `Check this car image for issues. Answer each question with YES or NO:
1. Does the image have any wrong brand logos (e.g. a Tesla logo on a non-Tesla car)?
2. Does the image have any large text, watermarks, or graphics overlaid on the car body?
3. Does the image have any major distortions or artifacts?

Reply in this exact format:
WRONG_LOGO: YES/NO
TEXT_OVERLAY: YES/NO
DISTORTION: YES/NO`;

    parts.push({ text: prompt });

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts }],
    });

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log(`Verification result: ${text.replace(/\n/g, ' | ')}`);

    // Parse results
    const sameCar = heroData ? /SAME_CAR:\s*YES/i.test(text) : true;
    const wrongLogo = /WRONG_LOGO:\s*YES/i.test(text);
    const textOverlay = /TEXT_OVERLAY:\s*YES/i.test(text);
    const distortion = /DISTORTION:\s*YES/i.test(text);

    if (!sameCar) return { pass: false, reason: "wrong car model" };
    if (wrongLogo) return { pass: false, reason: "wrong brand logo on car" };
    if (textOverlay) return { pass: false, reason: "text or graphics overlaid on car body" };
    if (distortion) return { pass: false, reason: "major distortions or artifacts" };

    return { pass: true, reason: "ok" };
  } catch (err) {
    console.log("Verification error, assuming pass:", err.message);
    return { pass: true, reason: "verification error" };
  }
}

module.exports = { generateAllImages, ANGLE_PROMPTS };
