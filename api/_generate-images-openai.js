const OpenAI = require("openai");
const { toFile } = require("openai");
const fs = require("fs");
const path = require("path");

const ANGLE_PROMPTS = [
  "front view, straight on, headlights visible, low angle",
  "passenger side profile, full side view facing right",
  "rear view, straight on, taillights visible",
  "driver side profile, full side view facing left",
  "front three-quarter view, looking at hood and driver side",
  "rear three-quarter view, looking at trunk and passenger side",
];

const HERO_INDEX = 4;

let BG_IMAGE_B64 = null;
function loadBgImage() {
  if (BG_IMAGE_B64) return;
  const imgPath = path.join(process.cwd(), "images", "showroom-bg.png");
  BG_IMAGE_B64 = fs.readFileSync(imgPath).toString("base64");
}

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  return new OpenAI({ apiKey });
}

const BASE_PROMPT = `Professional automotive photography. Shot with a Canon EOS R5, 85mm f/1.4 lens. Real metal, real glass, real rubber tires, real paint reflections. No CGI, no rendering artifacts, no AI-generated distortions. No text, no watermarks, no logos on the car body. Only factory badges in correct positions.`;

async function generateHeroImage(client, carDescription, bgBase64, userPhotoBase64) {
  const prompt = `${BASE_PROMPT}

${carDescription}

Place this car in the EXACT showroom environment shown in the reference image — same dark studio, same polished concrete floor, same subtle center spotlight, same lighting. The background must match the reference image exactly.

Camera angle: ${ANGLE_PROMPTS[HERO_INDEX]}.`;

  // Build image inputs for the edit endpoint
  const images = [];

  // Background reference
  images.push(await b64ToFile(bgBase64, "showroom-bg.png", "image/png"));

  // User photo reference if available
  if (userPhotoBase64) {
    images.push(await b64ToFile(userPhotoBase64.data, "user-car.jpg", userPhotoBase64.mimeType || "image/jpeg"));
  }

  const result = await client.images.edit({
    model: "gpt-image-1.5",
    image: images,
    prompt,
    size: "1536x1024",
    quality: "high",
  });

  return result.data[0].b64_json;
}

async function generateAngleFromHero(client, heroBase64, bgBase64, carDescription, angleIndex, userPhotoBase64) {
  const prompt = `${BASE_PROMPT}

Generate the EXACT same car shown in the first reference image, viewed from a different camera angle. Every detail must be identical — same body color, same finish, same wheels, same trim color, same body shape, same lighting. If the reference shows a matte black car, this MUST be matte black. Do NOT revert to any other color.

The car is: ${carDescription}

Use the showroom background from the reference — same dark studio, same floor, same lighting.

Camera angle for this image: ${ANGLE_PROMPTS[angleIndex]}.

CRITICAL: The car color and all details must EXACTLY match the hero reference image.`;

  const images = [];
  images.push(await b64ToFile(heroBase64, "hero.png", "image/png"));
  images.push(await b64ToFile(bgBase64, "showroom-bg.png", "image/png"));

  if (userPhotoBase64) {
    images.push(await b64ToFile(userPhotoBase64.data, "user-car.jpg", userPhotoBase64.mimeType || "image/jpeg"));
  }

  const result = await client.images.edit({
    model: "gpt-image-1.5",
    image: images,
    prompt,
    size: "1536x1024",
    quality: "high",
  });

  return result.data[0].b64_json;
}

async function generateAllImages(carDescription, userPhoto) {
  loadBgImage();
  const client = getClient();

  // Step 1: Generate hero image
  console.log("Generating hero image (angle " + HERO_INDEX + ") with GPT-Image-1.5...");
  const heroB64 = await generateHeroImage(client, carDescription, BG_IMAGE_B64, userPhoto);
  console.log("Hero image generated.");

  // Step 2: Generate remaining 5 angles in parallel
  console.log("Generating remaining 5 angles...");
  const remainingIndices = [0, 1, 2, 3, 5];
  const remainingResults = await Promise.all(
    remainingIndices.map((i) =>
      generateAngleFromHero(client, heroB64, BG_IMAGE_B64, carDescription, i, userPhoto)
    )
  );
  console.log("All 6 angles generated.");

  // Assemble all 6 images
  const allImages = new Array(6);
  allImages[HERO_INDEX] = { data: heroB64, mimeType: "image/png" };

  remainingIndices.forEach((origIdx, resultIdx) => {
    allImages[origIdx] = { data: remainingResults[resultIdx], mimeType: "image/png" };
  });

  return allImages;
}

// Helper: convert base64 to an OpenAI-compatible File object
async function b64ToFile(base64Data, filename, mimeType) {
  const buffer = Buffer.from(base64Data, "base64");
  return await toFile(buffer, filename, { type: mimeType });
}

module.exports = { generateAllImages, ANGLE_PROMPTS };
