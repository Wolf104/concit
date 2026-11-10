// Runs once a day (see vercel.json) so the free Supabase database is used regularly and doesn't pause.
// It only reads one public row. The key below is the public key that is already in config.js.
const URL = "https://hwjpklsxobhzqyvzqkza.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3anBrbHN4b2JoenF5dnpxa3phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2NDc3OTgsImV4cCI6MjEwOTIyMzc5OH0.n5kqOGbHHfMZXWMvSQFeRhDtEFU15bysWoKzBpbVMDo";

module.exports = async function handler(req, res) {
  const key = process.env.SUPABASE_ANON_KEY || ANON;
  try {
    const r = await fetch(`${URL}/rest/v1/places?select=id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    res.status(r.ok ? 200 : 502).json({ ok: r.ok, status: r.status });
  } catch (e) {
    res.status(502).json({ ok: false });
  }
};
