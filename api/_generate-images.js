const { generateImageWithRetry } = require("./_retry");

const ANGLE_PROMPTS = [
  "front view, straight on, headlights visible, low angle",
  "passenger side profile, full side view facing right",
  "rear view, straight on, taillights visible",
  "driver side profile, full side view facing left",
  "front three-quarter view from above, looking down at hood and driver side",
  "rear three-quarter view from above, looking down at trunk and passenger side",
];

// Hero image approach: generate one image first, then use it as reference for the rest
async function generateAllImages(ai, referenceImages, bgImage, promptText) {
  const HERO_INDEX = 4; // front 3/4 overhead — most detail visible

  // Step 1: Generate hero image
  console.log("Generating hero image (angle " + HERO_INDEX + ")...");
  const heroResult = await generateImageWithRetry(ai, [
    { inlineData: { data: referenceImages[HERO_INDEX].data, mimeType: referenceImages[HERO_INDEX].mimeType } },
    { inlineData: { data: bgImage.data, mimeType: bgImage.mimeType } },
    { text: promptText + "\n\nCamera angle: " + ANGLE_PROMPTS[HERO_INDEX] + "." },
  ]);

  const heroParts = heroResult.candidates?.[0]?.content?.parts || [];
  const heroImg = heroParts.find((p) => p.inlineData);
  if (!heroImg) throw new Error("No hero image in response");

  console.log("Hero image generated. Generating remaining 5 angles...");

  // Step 2: Generate remaining 5 angles using hero as additional reference
  const remainingIndices = [0, 1, 2, 3, 5];
  const remainingResults = await Promise.all(
    remainingIndices.map((i) =>
      generateImageWithRetry(ai, [
        { inlineData: { data: heroImg.inlineData.data, mimeType: heroImg.inlineData.mimeType } },
        { inlineData: { data: referenceImages[i].data, mimeType: referenceImages[i].mimeType } },
        { inlineData: { data: bgImage.data, mimeType: bgImage.mimeType } },
        {
          text: promptText + `

The first image is the EXACT car you must match — same make, model, color, wheels, every detail must be identical. Use it as your primary reference for how the car looks.
The second image shows the camera angle and composition to match: ${ANGLE_PROMPTS[i]}.
The third image is the showroom background to use.

The car in your output must look like the SAME car as the first image, just from a different angle. No text or watermarks.`,
        },
      ])
    )
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

  return allImages;
}

module.exports = { generateAllImages, ANGLE_PROMPTS };
