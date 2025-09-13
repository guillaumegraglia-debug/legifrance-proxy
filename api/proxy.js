export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  const { path, payload } = req.body || {};

  const tok = await fetch("https://oauth.piste.gouv.fr/api/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET
    })
  });
  if (!tok.ok) return res.status(502).json({ error: "oauth", details: await tok.text() });
  const { access_token } = await tok.json();

  const lf = await fetch("https://api.piste.gouv.fr/dila/legifrance/lf-engine-app" + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });

  const text = await lf.text();
  res.status(lf.status)
     .setHeader("Content-Type", lf.headers.get("content-type") || "application/json")
     .send(text);
}
