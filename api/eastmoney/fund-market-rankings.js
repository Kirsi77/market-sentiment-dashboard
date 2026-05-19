import { buildFundMarketRankings } from "../../server/eastmoney.js";

export default async function handler(_req, res) {
  try {
    const rankings = await buildFundMarketRankings();
    res.status(200).json({
      configured: true,
      ...rankings,
    });
  } catch (error) {
    res.status(500).json({
      configured: false,
      gainers: [],
      losers: [],
      purchases: [],
      sales: [],
      unavailable: {
        purchases: "公开接口未提供全市场真实申购/购买量排名。",
        sales: "公开接口未提供全市场真实赎回/售出量排名。",
      },
      error: error.message,
    });
  }
}
