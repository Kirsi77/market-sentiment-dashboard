import { searchFunds } from "../../server/eastmoney.js";

export default async function handler(req, res) {
  const keyword = req.query.keyword;
  if (!keyword || typeof keyword !== "string") {
    res.status(400).json({ configured: false, funds: [], error: "缺少搜索关键词" });
    return;
  }

  try {
    const funds = await searchFunds(keyword);
    res.status(200).json({
      configured: true,
      funds,
      source: "天天基金公开基金搜索",
    });
  } catch (error) {
    res.status(500).json({ configured: false, funds: [], error: error.message });
  }
}
