const { generateImageWithRetry } = require("./_retry");

const ANGLE_PROMPTS = [
  "front view, straight on, headlights visible, low angle",
  "passenger side profile, full side view facing right",
  "rear view, straight on, taillights visible",
  "driver side profile, full side view facing left",
  "front three-quarter view from above, looking down at hood and driver side",
  "rear three-quarter view from above, looking down at trunk and passenger side",
];

// Generate all 6 images with hero + verify/regenerate approach
// userPhoto is optional — if provided, included in every call for better consistency
async function generateAllImages(ai, referenceImages, bgImage, promptText, userPhoto) {
  const HERO_INDEX = 4; // front 3/4 overhead — most detail visible

  // Step 1: Generate hero image
  console.log("Generating hero image (angle " + HERO_INDEX + ")...");
  const heroParts = [
    { inlineData: { data: referenceImages[HERO_INDEX].data, mimeType: referenceImages[HERO_INDEX].mimeType } },
    { inlineData: { data: bgImage.data, mimeType: bgImage.mimeType } },
  ];
  // Include user's original photo if available
  if (userPhoto) {
    heroParts.unshift({ inlineData: { data: userPhoto.data, mimeType: userPhoto.mimeType } });
    heroParts.push({
      text: `The first image is the customer's actual car — match this car EXACTLY (same make, model, body shape, design details).
${promptText}
Camera angle: ${ANGLE_PROMPTS[HERO_INDEX]}.
Use the angle reference and showroom background provided.`,
    });
  } else {
    heroParts.push({
      text: promptText + "\n\nCamera angle: " + ANGLE_PROMPTS[HERO_INDEX] + ".",
    });
  }

  const heroResult = await generateImageWithRetry(ai, heroParts);
  const heroPartsResp = heroResult.candidates?.[0]?.content?.parts || [];
  const heroImg = heroPartsResp.find((p) => p.inlineData);
  if (!heroImg) throw new Error("No hero image in response");

  console.log("Hero image generated. Generating remaining 5 angles...");

  // Step 2: Generate remaining 5 angles using hero + optional user photo
  const remainingIndices = [0, 1, 2, 3, 5];
  const remainingResults = await Promise.all(
    remainingIndices.map((i) => {
      const parts = [];
      // Include user photo first if available
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
${promptText}

CRITICAL: The car must be the EXACT same make, model, and body shape as the reference. Not a similar car — the SAME car from a different angle. No text or watermarks.`,
      });

      return generateImageWithRetry(ai, parts);
    })
  );

  // Assemble all 6 images in order
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

  // Step 3: Verify consistency — check each image matches the hero
  console.log("Verifying consistency across angles...");
  const verifyResults = await Promise.all(
    allImages.map((img, i) => {
      if (i === HERO_INDEX) return Promise.resolve({ pass: true });
      return ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { data: heroImg.inlineData.data, mimeType: heroImg.inlineData.mimeType } },
              { inlineData: { data: img.data, mimeType: img.mimeType } },
              {
                text: `Are these two images of the EXACT same car make and model? Look at the body shape, headlights, grille, and overall design — not the angle or color shade.

Reply with ONLY "YES" or "NO".`,
              },
            ],
          },
        ],
      }).then((r) => {
        const text = r.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const pass = text.trim().toUpperCase().startsWith("YES");
        console.log(`Angle ${i} verification: ${text.trim()} (${pass ? "PASS" : "FAIL"})`);
        return { pass, index: i };
      }).catch(() => ({ pass: true, index: i })); // if verify fails, assume pass
    })
  );

  // Step 4: Regenerate any that failed verification (one retry)
  const failures = verifyResults.filter((v) => !v.pass);
  if (failures.length > 0) {
    console.log(`Regenerating ${failures.length} inconsistent angles...`);
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
          text: `IMPORTANT: You previously generated the wrong car model. You MUST generate the EXACT same car as shown in the reference image.
${userPhoto ? "The first image is the customer's actual car. The second is the correct car in a showroom." : "The first image is the correct car."}
Match this car's body shape, headlights, grille, and every design detail exactly. Just show it from this angle: ${ANGLE_PROMPTS[i]}.
${promptText}
No text or watermarks.`,
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

module.exports = { generateAllImages, ANGLE_PROMPTS };
