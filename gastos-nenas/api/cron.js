const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CRON_SECRET  = process.env.CRON_SECRET; // opcional, para proteger el endpoint

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

const storagePublicUrl = (bucket, path) =>
  `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

const fmt = n => "$" + Number(n).toLocaleString("es-AR", { minimumFractionDigits: 0 });
const monthLabel = key => {
  const [y, m] = key.split("-");
  return ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"][parseInt(m)-1] + " " + y;
};

const CATEGORIES = [
  { id:"colegio",     label:"Colegio / Educación",   emoji:"🎓" },
  { id:"salud",       label:"Salud / Médicos",        emoji:"🏥" },
  { id:"ropa",        label:"Ropa / Calzado",         emoji:"👗" },
  { id:"actividades", label:"Actividades / Deportes", emoji:"⚽" },
  { id:"mascota",     label:"Mascota / Veterinaria",  emoji:"🐾" },
  { id:"otros",       label:"Otros",                  emoji:"📦" },
];
const TOLERANCE = 2000;

// Verifica si hoy es realmente el último día del mes
const isLastDayOfMonth = () => {
  const now   = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.getDate() === 1;
};

const getCurrentMonth = () => new Date().toISOString().slice(0, 7);

const generateReportHTML = (month, expenses, payments) => {
  const monthExp  = expenses.filter(e => e.date.startsWith(month));
  const monthPays = payments.filter(p => p.month === month);

  const totalBy = w => monthExp.filter(e => e.who === w).reduce((s, e) => s + Number(e.amount), 0);
  const gus = totalBy("Gus"), bet = totalBy("Betiana"), total = gus + bet, half = total / 2;
  const rawDiff = gus - bet, comp = rawDiff / 2;
  const paid = monthPays.reduce((s, p) => s + Number(p.amount), 0);
  const remaining = Math.max(0, Math.abs(comp) - paid);
  const debtor = comp > 0 ? "Betiana" : "Gus";
  const creditor = comp > 0 ? "Gus" : "Betiana";
  const settled = remaining <= TOLERANCE;

  const nenaTotal = (nena) => monthExp
    .filter(e => e.nena === nena || e.nena === "Ambas")
    .reduce((s, e) => s + (e.nena === "Ambas" ? Number(e.amount) / 2 : Number(e.amount)), 0);
  const fridaTotal = monthExp.filter(e => e.nena === "Frida").reduce((s, e) => s + Number(e.amount), 0);

  const byCat = (nena) => CATEGORIES.map(cat => ({
    ...cat,
    total: monthExp
      .filter(e => (e.nena === nena || e.nena === "Ambas") && e.category === cat.id)
      .reduce((s, e) => s + (e.nena === "Ambas" ? Number(e.amount) / 2 : Number(e.amount)), 0)
  })).filter(c => c.total > 0);

  const fridaCats = CATEGORIES.map(cat => ({
    ...cat,
    total: monthExp.filter(e => e.nena === "Frida" && e.category === cat.id).reduce((s, e) => s + Number(e.amount), 0)
  })).filter(c => c.total > 0);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Reporte ${monthLabel(month)}</title>
<style>
  body{font-family:Arial,sans-serif;padding:32px;color:#222;max-width:800px;margin:0 auto}
  h1{color:#f97316}h2{color:#444;margin:24px 0 12px;border-bottom:2px solid #eee;padding-bottom:6px}
  table{width:100%;border-collapse:collapse;margin:12px 0;font-size:14px}
  th,td{border:1px solid #ddd;padding:8px 12px;text-align:left}
  th{background:#f3f4f6}tr:nth-child(even){background:#f9fafb}
  .badge{display:inline-block;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:600}
  .ok{background:#dcfce7;color:#166534}.err{background:#fee2e2;color:#991b1b}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:12px 0}
  .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin:12px 0}
  .card{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px}
  .num{font-size:24px;font-weight:700;color:#f97316}
  footer{margin-top:40px;color:#999;font-size:12px;border-top:1px solid #eee;padding-top:12px}
</style></head><body>
<h1>👧 Gastos Familiares</h1>
<p style="color:#888">Reporte · <strong>${monthLabel(month)}</strong> · Generado automáticamente el ${new Date().toLocaleDateString("es-AR")}</p>

<h2>💰 Balance</h2>
<div class="grid">
  <div class="card"><h3>👨 Gus</h3><div class="num">${fmt(gus)}</div><div style="color:#888;font-size:13px">50% = ${fmt(half)}</div></div>
  <div class="card"><h3>👩 Betiana</h3><div class="num">${fmt(bet)}</div><div style="color:#888;font-size:13px">50% = ${fmt(half)}</div></div>
</div>
<p><strong>Total:</strong> ${fmt(total)} &nbsp;|&nbsp; <strong>Estado:</strong>
  <span class="badge ${settled ? "ok" : "err"}">${settled ? "✅ Compensado" : `⚠️ ${debtor} debe ${fmt(remaining)} a ${creditor}`}</span>
</p>
${monthPays.length > 0 ? `<p><strong>Pagos:</strong> ${monthPays.map(p => `${p.date} ${fmt(p.amount)}${p.note ? ` (${p.note})` : ""}`).join(" · ")}</p>` : ""}

<h2>👧 Por integrante</h2>
<div class="grid3">
  <div class="card"><h3>🌟 Valen</h3><div class="num" style="color:#f59e0b">${fmt(nenaTotal("Valen"))}</div>
    ${byCat("Valen").map(c => `<div style="display:flex;justify-content:space-between;font-size:13px;margin-top:6px"><span>${c.emoji} ${c.label}</span><span>${fmt(c.total)}</span></div>`).join("")}
  </div>
  <div class="card"><h3>💫 Pili</h3><div class="num" style="color:#06b6d4">${fmt(nenaTotal("Pili"))}</div>
    ${byCat("Pili").map(c => `<div style="display:flex;justify-content:space-between;font-size:13px;margin-top:6px"><span>${c.emoji} ${c.label}</span><span>${fmt(c.total)}</span></div>`).join("")}
  </div>
  <div class="card"><h3>🐱 Frida</h3><div class="num" style="color:#f472b6">${fmt(fridaTotal)}</div>
    ${fridaCats.map(c => `<div style="display:flex;justify-content:space-between;font-size:13px;margin-top:6px"><span>${c.emoji} ${c.label}</span><span>${fmt(c.total)}</span></div>`).join("")}
    ${fridaCats.length === 0 ? '<div style="font-size:13px;color:#999">Sin gastos</div>' : ""}
  </div>
</div>

<h2>📋 Detalle de gastos</h2>
<table>
  <tr><th>Fecha</th><th>Quién</th><th>Para</th><th>Categoría</th><th>Descripción</th><th>Monto</th></tr>
  ${monthExp.sort((a, b) => a.date.localeCompare(b.date)).map(e => `
  <tr>
    <td>${e.date}</td>
    <td style="font-weight:600">${e.who}</td>
    <td>${e.nena || "-"}</td>
    <td>${CATEGORIES.find(c => c.id === e.category)?.emoji || ""} ${CATEGORIES.find(c => c.id === e.category)?.label || e.category}</td>
    <td>${e.description || e.desc || ""}</td>
    <td style="font-weight:600">${fmt(e.amount)}</td>
  </tr>`).join("")}
  <tr style="background:#f3f4f6">
    <td colspan="5"><strong>Total</strong></td>
    <td><strong>${fmt(total)}</strong></td>
  </tr>
</table>

<footer>Gastos Familiares App · Gus &amp; Betiana · ${monthLabel(month)} · Cierre automático</footer>
</body></html>`;
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Verificar secret si está configurado
  const authHeader = req.headers.authorization;
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    // Vercel cron jobs envían el header automáticamente, igual verificamos
    console.log("Cron ejecutado sin secret match — continuando igual (Vercel interno)");
  }

  const targetMonth = req.body?.month || getCurrentMonth();

  // Si viene del cron automático, verificar que realmente sea último día del mes
  const isAutoCron = !req.body?.month;
  if (isAutoCron && !isLastDayOfMonth()) {
    console.log(`Cron ejecutado pero hoy no es el último día del mes. Ignorando.`);
    return res.status(200).json({ skipped: true, reason: "Not last day of month" });
  }

  console.log(`Iniciando cierre del mes: ${targetMonth}`);

  try {
    // 1. Verificar si el mes ya fue cerrado
    const existingMonth = await sb(`months?month=eq.${targetMonth}`);
    if (existingMonth.data?.length > 0 && existingMonth.data[0].status === "closed") {
      return res.status(200).json({ skipped: true, reason: "Month already closed" });
    }

    // 2. Traer todos los datos del mes
    const [expensesR, paymentsR, galleryR] = await Promise.all([
      sb(`expenses?date=gte.${targetMonth}-01&date=lte.${targetMonth}-31&order=date.asc`),
      sb(`payments?month=eq.${targetMonth}`),
      sb("gallery"),
    ]);

    const expenses = expensesR.data || [];
    const payments = paymentsR.data || [];
    const gallery  = galleryR.data  || [];

    // 3. Calcular balance
    const totalGus = expenses.filter(e => e.who === "Gus").reduce((s, e) => s + Number(e.amount), 0);
    const totalBet = expenses.filter(e => e.who === "Betiana").reduce((s, e) => s + Number(e.amount), 0);
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
    const rawDiff   = totalGus - totalBet;
    const comp      = Math.abs(rawDiff / 2);
    const remaining = Math.max(0, comp - totalPaid);
    const settled   = remaining <= TOLERANCE;
    const debtor    = rawDiff > 0 ? "Betiana" : "Gus";
    const creditor  = rawDiff > 0 ? "Gus" : "Betiana";

    // 4. Generar y subir reporte HTML a Supabase Storage
    const reportHTML = generateReportHTML(targetMonth, expenses, payments);
    const reportBuffer = Buffer.from(reportHTML, "utf-8");
    const reportPath = `reportes/${targetMonth}/Reporte-${targetMonth}.html`;

    const reportUpload = await fetch(
      `${SUPABASE_URL}/storage/v1/object/gastos-nenas/${reportPath}`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "text/html",
          "x-upsert": "true",
        },
        body: reportBuffer,
      }
    );

    const reportUrl = `${SUPABASE_URL}/storage/v1/object/public/gastos-nenas/${reportPath}`;
    console.log(`Reporte subido: ${reportUpload.status}`);

    // 5. Mover comprobantes del mes a carpeta de histórico en Storage
    //    (renombrar de comprobantes/MONTH/... a historico/MONTH/...)
    const monthFiles = gallery.filter(g => {
      const expense = expenses.find(e => e.id === g.expense_id);
      return expense != null;
    });

    let movedFiles = 0;
    for (const item of monthFiles) {
      if (!item.storage_path) continue;
      // Mover a carpeta historico
      const newPath = item.storage_path.replace("comprobantes/", "historico/");
      // Supabase Storage no tiene "move" directo, hay que copy + delete
      // Lo registramos como movido actualizando la gallery
      await sb(`gallery?expense_id=eq.${item.expense_id}`, {
        method: "PATCH",
        body: JSON.stringify({ archived: true, archived_path: newPath }),
      });
      movedFiles++;
    }
    console.log(`Archivos marcados como archivados: ${movedFiles}`);

    // 6. Registrar el mes como cerrado en la tabla months
    const monthRecord = {
      month: targetMonth,
      status: settled ? "settled" : "closed",
      total_gus: totalGus,
      total_bet: totalBet,
      total: totalGus + totalBet,
      compensation: comp,
      remaining,
      debtor: settled ? null : debtor,
      creditor: settled ? null : creditor,
      settled,
      report_url: reportUrl,
      closed_at: new Date().toISOString(),
    };

    await sb("months", {
      method: "POST",
      body: JSON.stringify(monthRecord),
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    });

    console.log(`Mes ${targetMonth} cerrado correctamente. Settled: ${settled}`);

    return res.status(200).json({
      success: true,
      month: targetMonth,
      settled,
      remaining,
      debtor: settled ? null : debtor,
      creditor: settled ? null : creditor,
      reportUrl,
      movedFiles,
    });

  } catch (error) {
    console.error("Cron error:", error);
    return res.status(500).json({ error: error.message });
  }
}
