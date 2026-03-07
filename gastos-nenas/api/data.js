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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { action, table, id, data, month } = req.body || {};

  try {
    // GET ALL
    if (action === "getAll") {
      const expenses = await sb("expenses?order=date.desc");
      const payments = await sb("payments?order=date.desc");
      const gallery  = await sb("gallery");
      return res.status(200).json({
        expenses: expenses.data || [],
        payments: payments.data || [],
        gallery:  gallery.data  || [],
      });
    }

    // INSERT
    if (action === "insert") {
      const r = await sb(table, { method: "POST", body: JSON.stringify(data) });
      return res.status(r.ok ? 200 : 400).json(r.data);
    }

    // UPDATE
    if (action === "update") {
      const r = await sb(`${table}?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(data) });
      return res.status(r.ok ? 200 : 400).json(r.data);
    }

    // DELETE
    if (action === "delete") {
      const r = await sb(`${table}?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" });
      return res.status(r.ok ? 200 : 400).json({ deleted: true });
    }

    // UPSERT GALLERY
    if (action === "upsertGallery") {
      const r = await sb("gallery", { method: "POST", body: JSON.stringify(data), headers: { Prefer: "resolution=merge-duplicates,return=representation" } });
      return res.status(r.ok ? 200 : 400).json(r.data);
    }

    return res.status(400).json({ error: "Acción no reconocida" });
  } catch (error) {
    console.error("Supabase error:", error);
    return res.status(500).json({ error: error.message });
  }
}
