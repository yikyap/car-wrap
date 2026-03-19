// Retry wrapper for Gemini API calls
async function withRetry(fn, retries = 1, delay = 1000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable =
        err.status === 500 ||
        err.status === 503 ||
        (err.message && err.message.includes("Internal error"));
      if (attempt < retries && isRetryable) {
        console.log(`Retry attempt ${attempt + 1} after error: ${err.message}`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

// Generate a single image with retry, used by all endpoints
async function generateImageWithRetry(ai, parts) {
  return withRetry(() =>
    ai.models.generateContent({
      model: "gemini-3.1-flash-image-preview",
      contents: [{ role: "user", parts }],
    })
  );
}

module.exports = { withRetry, generateImageWithRetry };
