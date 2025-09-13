// api/proxy.js — tolérant (accepte payload objet OU string), renvoie toujours 200
module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(200).json({ ok: false, status: 405, error: "Method Not Allowed" });
    }

    // Normalise le body
    let { path, payload } = req.body || {};
    if (!path) {
      return res.status(200).json({ ok: false, status: 400, error: "Missing 'path' in body" });
    }
    if (typeof payload === "string") { try { payload = JSON.parse(payload); } catch {} }
    if (payload == null) payload = {};

    // 1) OAuth PISTE
    const tokResp = await fetch("https://oauth.piste.gouv.fr/api/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET
      })
    });
    const tokText = await tokResp.text();
    if (!tokResp.ok) return res.status(200).json({ ok: false, step: "oauth", status: tokResp.status, error: tokText });

    let access_token = ""; try { access_token = JSON.parse(tokText).access_token; } catch {}
    if (!access_token) return res.status(200).json({ ok: false, step: "oauth", status: tokResp.status, error: "No access_token" });

    // 2) Appel Légifrance
    const lfResp = await fetch("https://api.piste.gouv.fr/dila/legifrance/lf-engine-app" + path, {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const lfText = await lfResp.text();
    let data; try { data = JSON.parse(lfText); } catch { data = lfText; }

    // Toujours 200 pour ne pas casser l’Action GPT
    return res.status(200).json({ ok: lfResp.ok, status: lfResp.status, data });
  } catch (e) {
    return res.status(200).json({ ok: false, step: "proxy", status: 500, error: String(e) });
  }
};
