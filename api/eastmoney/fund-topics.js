import { buildFundTopics } from "../../server/eastmoney.js";

export default async function handler(_req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=1800");
  try {
    const topics = await buildFundTopics();
    res.status(200).json({
      configured: true,
      source: "天天基金主题基金公开数据",
      topics,
    });
  } catch (error) {
    res.status(500).json({ configured: false, topics: [], error: error.message });
  }
}
