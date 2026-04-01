const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

let _client = null;
function getClient() {
  if (!_client) {
    if (!supabaseUrl || !supabaseKey) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_KEY not configured");
    _client = createClient(supabaseUrl, supabaseKey);
  }
  return _client;
}

function normalize(str) {
  return str ? str.trim().toLowerCase().replace(/\s+/g, " ") : null;
}

async function lookupCache({ year, make, model, body_color, wheel_color, trim_color, tint_level }) {
  const sb = getClient();

  // Try exact match first, then progressively relax constraints
  const searches = [
    // 1. Exact match on all fields
    () => {
      let q = sb.from("visualizer_cache").select("id, images, confirmed, rejected")
        .eq("year", normalize(year)).eq("make", normalize(make))
        .eq("model", normalize(model)).eq("body_color", normalize(body_color));
      if (wheel_color) q = q.eq("wheel_color", normalize(wheel_color)); else q = q.is("wheel_color", null);
      if (trim_color) q = q.eq("trim_color", normalize(trim_color)); else q = q.is("trim_color", null);
      if (tint_level) q = q.eq("tint_level", normalize(tint_level)); else q = q.is("tint_level", null);
      return q.order("confirmed", { ascending: false }).order("rejected", { ascending: true }).limit(5);
    },
    // 2. Match year/make/model/body_color only (ignore wheel, trim, tint)
    () => sb.from("visualizer_cache").select("id, images, confirmed, rejected")
      .eq("year", normalize(year)).eq("make", normalize(make))
      .eq("model", normalize(model)).eq("body_color", normalize(body_color))
      .order("confirmed", { ascending: false }).order("rejected", { ascending: true }).limit(5),
    // 3. Match make/model/body_color only (any year)
    () => sb.from("visualizer_cache").select("id, images, confirmed, rejected")
      .eq("make", normalize(make)).eq("model", normalize(model))
      .eq("body_color", normalize(body_color))
      .order("confirmed", { ascending: false }).order("rejected", { ascending: true }).limit(5),
  ];

  for (const search of searches) {
    const { data, error } = await search();
    if (error || !data || data.length === 0) continue;

    const good = data.filter(d => !(d.rejected >= 3 && d.confirmed === 0));
    if (good.length === 0) continue;

    const pick = good[0];
    // Increment hit_count (fire-and-forget)
    sb.from("visualizer_cache").update({ hit_count: (pick.hit_count || 0) + 1 }).eq("id", pick.id).then(() => {});
    return { images: pick.images, cacheId: pick.id };
  }

  return null;
}

async function confirmCache(id) {
  try {
    const sb = getClient();
    const { data } = await sb.from("visualizer_cache").select("confirmed").eq("id", id).single();
    if (data) {
      await sb.from("visualizer_cache").update({ confirmed: (data.confirmed || 0) + 1 }).eq("id", id);
    }
  } catch (err) {
    console.error("confirmCache error:", err);
  }
}

async function rejectCache(id) {
  try {
    const sb = getClient();
    const { data } = await sb.from("visualizer_cache").select("rejected").eq("id", id).single();
    if (data) {
      await sb.from("visualizer_cache").update({ rejected: (data.rejected || 0) + 1 }).eq("id", id);
    }
  } catch (err) {
    console.error("rejectCache error:", err);
  }
}

async function saveToCache(metadata, base64Images, carDescription) {
  try {
    const sb = getClient();
    const id = crypto.randomUUID();
    const bucket = "visualizer-images";
    const prefix = `${normalize(metadata.make)}/${normalize(metadata.model)}/${id}`;

    // Upload images to storage
    const imageUrls = [];
    for (let i = 0; i < base64Images.length; i++) {
      const img = base64Images[i];
      const buffer = Buffer.from(img.data, "base64");
      const ext = img.mimeType === "image/png" ? "png" : "webp";
      const filePath = `${prefix}/angle-${i}.${ext}`;

      const { error: uploadErr } = await sb.storage
        .from(bucket)
        .upload(filePath, buffer, { contentType: img.mimeType, upsert: true });

      if (uploadErr) {
        console.error("Storage upload error:", uploadErr);
        return null;
      }

      const { data: urlData } = sb.storage.from(bucket).getPublicUrl(filePath);
      imageUrls.push({ url: urlData.publicUrl, mimeType: img.mimeType, angle: i });
    }

    // Insert DB row
    const { error: insertErr } = await sb.from("visualizer_cache").insert({
      id,
      year: normalize(metadata.year),
      make: normalize(metadata.make),
      model: normalize(metadata.model),
      body_color: normalize(metadata.body_color),
      wheel_color: normalize(metadata.wheel_color),
      trim_color: normalize(metadata.trim_color),
      tint_level: normalize(metadata.tint_level),
      images: imageUrls,
      car_description: carDescription || null,
    });

    if (insertErr) {
      console.error("Cache insert error:", insertErr);
      return null;
    }

    return id;
  } catch (err) {
    console.error("saveToCache error:", err);
    return null;
  }
}

module.exports = { getClient, normalize, lookupCache, saveToCache, confirmCache, rejectCache };
