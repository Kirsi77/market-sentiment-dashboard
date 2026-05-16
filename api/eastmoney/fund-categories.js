import { buildFundCategories } from "../../server/eastmoney.js";

export default async function handler(_req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=1800");
  try {
    const categories = await buildFundCategories();
    res.status(200).json({
      configured: true,
      source: "天天基金公开排行数据",
      categories,
    });
  } catch (error) {
    res.status(500).json({ configured: false, categories: [], error: error.message });
  }
}
