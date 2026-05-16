import { buildEastmoneySignals } from "../../server/eastmoney.js";

export default async function handler(_req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  try {
    const signals = await buildEastmoneySignals();
    res.status(200).json({
      configured: true,
      source: "东方财富指数 K 线公开数据",
      count: signals.length,
      signals,
    });
  } catch (error) {
    res.status(500).json({ configured: false, signals: [], error: error.message });
  }
}
