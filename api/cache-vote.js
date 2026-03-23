const { confirmCache, rejectCache } = require("./_supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { cacheId, vote } = req.body;
  if (!cacheId || !vote) {
    return res.status(400).json({ error: "Missing cacheId or vote" });
  }

  try {
    if (vote === "confirm") {
      await confirmCache(cacheId);
    } else if (vote === "reject") {
      await rejectCache(cacheId);
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Cache vote error:", err);
    return res.status(200).json({ ok: true }); // Don't fail user flow
  }
};
