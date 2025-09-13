// api/proxy.js — proxy tolérant pour Actions GPT
// - Accepte payload objet OU string JSON
// - Accepte alias "params"
// - Si des query params sont dans "path", ils sont fusionnés dans le payload
// - Renvoie TOUJOURS HTTP 200 (ok/status dans le corps) pour ne pas casser le GPT

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(200).json({ ok: false, status: 405, error: "Method Not Allowed" });
    }

    // ---- NORMALISATION ENTREE ----
    let { path, payload, params } = req.body || {};
    if (!path) return res.status(200).json({ ok: false, status: 400, error: "Missing 'path' in body" });

    // parse éventuelle string JSON
    if (typeof payload === "string") { try { payload = JSON.parse(payload); } catch {} }
    if (typeof params  === "string") { try { params  = JSON.parse(params);  } catch {} }

    // path peut contenir des query ?id=...&num=...
    const u = new URL(path, "https://dummy.local");     // origine factice pour parser
    const legiPath = u.pathname;

    // construit fromQuery depuis l'URL
    const fromQuery = {};
    u.searchParams.forEach((v, k) => { fromQuery[k] = v; });

    // fusion finale (ordre = query → params → payload)
    payload = Object.assign({}, fromQuery, params || {}, payload || {});

    // alias courants → schéma Légifrance attendu
    if (payload.cidTexte && !payload.id)   payload.id  = payload.cidTexte;
    if (payload.numArticle && !payload.num) payload.num = payload.numArticle;

    // ---- OAUTH PISTE ----
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
    if (!tokResp.ok) {
      return res.status(200).json({ ok: false, step: "oauth", status: tokResp.status, error: tokText });
    }
    let access_token = "";
    try { access_token = JSON.parse(tokText).access_token; } catch {}

    if (!access_token) {
      return res.status(200).json({ ok: false, step: "oauth", status: tokResp.status, error: "No access_token" });
    }

    // ---- APPEL LÉGIFRANCE ----
    const lfResp = await fetch("https://api.piste.gouv.fr/dila/legifrance/lf-engine-app" + legiPath, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const lfText = await lfResp.text();
    let data;
    try { data = JSON.parse(lfText); } catch { data = lfText; }

    // Toujours 200 → status réel et données renvoyés dans le corps
    return res.status(200).json({
      ok: lfResp.ok,
      status: lfResp.status,
      request: { path: legiPath, payload },   // utile pour debug
      data
    });
  } catch (e) {
    return res.status(200).json({ ok: false, step: "proxy", status: 500, error: String(e) });
  }
};
