const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const sb = async (path, opts = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: opts.prefer || "return=representation",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
};

// Supabase Storage helper
const sbStorage = async (bucket, path, opts = {}) => {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
};

const storagePublicUrl = (bucket, path) =>
  `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { action, table, id, data, month } = req.body || {};

  try {

    // ── GET ALL ──────────────────────────────────────────────────────────────
    if (action === "getAll") {
      const [expenses, payments, gallery, profiles, months] = await Promise.all([
        sb("expenses?order=date.desc"),
        sb("payments?order=date.desc"),
        sb("gallery"),
        sb("profiles"),
        sb("months?order=month.desc"),
      ]);
      return res.status(200).json({
        expenses: expenses.data || [],
        payments: payments.data || [],
        gallery:  gallery.data  || [],
        profiles: profiles.data || [],
        months:   months.data   || [],
      });
    }

    // ── INSERT ───────────────────────────────────────────────────────────────
    if (action === "insert") {
      const r = await sb(table, { method: "POST", body: JSON.stringify(data) });
      return res.status(r.ok ? 200 : 400).json(r.data);
    }

    // ── UPDATE ───────────────────────────────────────────────────────────────
    if (action === "update") {
      const r = await sb(`${table}?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(data) });
      return res.status(r.ok ? 200 : 400).json(r.data);
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (action === "delete") {
      const r = await sb(`${table}?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" });
      return res.status(r.ok ? 200 : 400).json({ deleted: true });
    }

    // ── UPSERT GALLERY ───────────────────────────────────────────────────────
    if (action === "upsertGallery") {
      const r = await sb("gallery", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { Prefer: "resolution=merge-duplicates,return=representation" }
      });
      return res.status(r.ok ? 200 : 400).json(r.data);
    }

    // ── UPSERT PROFILE ───────────────────────────────────────────────────────
    if (action === "upsertProfile") {
      const r = await sb("profiles", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { Prefer: "resolution=merge-duplicates,return=representation" }
      });
      return res.status(r.ok ? 200 : 400).json(r.data);
    }

    // ── UPLOAD FILE TO STORAGE ───────────────────────────────────────────────
    // Recibe: { action:"uploadFile", bucket, path, fileBase64, mimeType }
    if (action === "uploadFile") {
      const { bucket, path: filePath, fileBase64, mimeType } = req.body;
      const buffer = Buffer.from(fileBase64, "base64");
      const r = await sbStorage(bucket, filePath, {
        method: "POST",
        headers: {
          "Content-Type": mimeType || "application/octet-stream",
          "x-upsert": "true",
        },
        body: buffer,
      });
      if (!r.ok) return res.status(400).json({ error: "Upload failed", detail: r.data });
      const publicUrl = storagePublicUrl(bucket, filePath);
      return res.status(200).json({ url: publicUrl });
    }

    // ── DELETE FILE FROM STORAGE ─────────────────────────────────────────────
    if (action === "deleteFile") {
      const { bucket, path: filePath } = req.body;
      const r = await sbStorage(bucket, filePath, { method: "DELETE" });
      return res.status(r.ok ? 200 : 400).json({ deleted: true });
    }

    // ── LIST FILES IN STORAGE ────────────────────────────────────────────────
    if (action === "listFiles") {
      const { bucket, folder } = req.body;
      const r = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prefix: folder || "", limit: 200 }),
      });
      const data = await r.json();
      return res.status(r.ok ? 200 : 400).json(data);
    }

    // ── UPSERT MONTH ─────────────────────────────────────────────────────────
    if (action === "upsertMonth") {
      const r = await sb("months", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { Prefer: "resolution=merge-duplicates,return=representation" }
      });
      return res.status(r.ok ? 200 : 400).json(r.data);
    }

    return res.status(400).json({ error: "Acción no reconocida" });

  } catch (error) {
    console.error("data.js error:", error);
    return res.status(500).json({ error: error.message });
  }
}
