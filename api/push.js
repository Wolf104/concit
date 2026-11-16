// Sends phone notifications for a plan. The app calls this right after someone makes a group plan
// ("new") or casts the vote that completes one ("done"), passing that person's own login token.
// The database decides whether a notification is due and who gets it (see supabase/push.sql);
// this file only delivers it. Secrets live in Vercel's environment variables, never in the code:
//   VAPID_PRIVATE_KEY  signs the notifications (pairs with vapidKey in config.js)
//   PUSH_SECRET        proves to the database that the request comes from here
const webpush = require("web-push");

const URL = "https://hwjpklsxobhzqyvzqkza.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3anBrbHN4b2JoenF5dnpxa3phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2NDc3OTgsImV4cCI6MjEwOTIyMzc5OH0.n5kqOGbHHfMZXWMvSQFeRhDtEFU15bysWoKzBpbVMDo";
const VAPID_PUBLIC = "BFf5RH9-jFH6MgxNabuuPUJHwSvFhxBD0FLYsouZ0f-Z1Fy5X5du0V_fLA5OELJlf3fe_8dgKhQI_ZclXfyV38c";
const CONTACT = "https://concit.app";

const rpc = (fn, token, body) =>
  fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const secret = process.env.PUSH_SECRET, key = process.env.VAPID_PRIVATE_KEY;
  if (!secret || !key) return res.status(503).json({ ok: false, error: "push not configured" });
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const { code, kind } = req.body || {};
  if (!token || typeof code !== "string" || code.length > 40 || !["new", "done"].includes(kind)) return res.status(400).json({ ok: false });

  try {
    const r = await rpc("push_claim", token, { p_code: code, p_kind: kind, p_secret: secret });
    if (!r.ok) return res.status(r.status === 401 ? 401 : 400).json({ ok: false });
    const job = await r.json();
    if (!job || !job.subs || !job.subs.length) return res.status(200).json({ ok: true, sent: 0 });

    const payload = JSON.stringify({ title: job.title, body: job.body, url: job.url, tag: job.tag });
    const options = { vapidDetails: { subject: CONTACT, publicKey: VAPID_PUBLIC, privateKey: key }, TTL: 6 * 3600, urgency: "high" };
    const gone = [];
    const results = await Promise.allSettled(job.subs.map(s =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, options)
        .catch(e => { if (e && (e.statusCode === 404 || e.statusCode === 410)) gone.push(s.endpoint); throw e; })));
    if (gone.length) await rpc("push_drop", ANON, { p_endpoints: gone, p_secret: secret }).catch(() => {});
    res.status(200).json({ ok: true, sent: results.filter(x => x.status === "fulfilled").length });
  } catch (e) {
    res.status(502).json({ ok: false });
  }
};
