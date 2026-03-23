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

async function lookupCache({ year, make, model, body_color, wheel_color, tint_level }) {
  const sb = getClient();
  let query = sb
    .from("visualizer_cache")
    .select("id, images")
    .eq("year", normalize(year))
    .eq("make", normalize(make))
    .eq("model", normalize(model))
    .eq("body_color", normalize(body_color));

  if (wheel_color) {
    query = query.eq("wheel_color", normalize(wheel_color));
  } else {
    query = query.is("wheel_color", null);
  }

  if (tint_level) {
    query = query.eq("tint_level", normalize(tint_level));
  } else {
    query = query.is("tint_level", null);
  }

  const { data, error } = await query.limit(1).single();
  if (error || !data) return null;

  // Increment hit_count (fire-and-forget)
  sb.from("visualizer_cache").update({ hit_count: data.hit_count + 1 }).eq("id", data.id).then(() => {});

  return data.images;
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
        return; // Don't save partial entries
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
      tint_level: normalize(metadata.tint_level),
      images: imageUrls,
      car_description: carDescription || null,
    }).single();

    if (insertErr) {
      // Unique constraint violation = another request already saved this combo, that's fine
      if (insertErr.code === "23505") return;
      console.error("Cache insert error:", insertErr);
    }
  } catch (err) {
    console.error("saveToCache error:", err);
    // Never let cache errors break the user flow
  }
}

module.exports = { getClient, normalize, lookupCache, saveToCache };
