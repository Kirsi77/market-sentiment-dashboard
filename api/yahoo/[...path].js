export default async function handler(req, res) {
  try {
    const path = Array.isArray(req.query?.path) ? req.query.path.join("/") : "";
    const target = new URL(`https://query1.finance.yahoo.com/${path}`);
    for (const [key, value] of Object.entries(req.query || {})) {
      if (key === "path") continue;
      if (Array.isArray(value)) {
        value.forEach((item) => target.searchParams.append(key, item));
      } else if (value !== undefined) {
        target.searchParams.set(key, value);
      }
    }
    const response = await fetch(target, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
    res.status(response.status).send(await response.text());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
