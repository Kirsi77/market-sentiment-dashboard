import { buildFundTopicDetail } from "../../server/eastmoney.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  try {
    const code = req.query?.code;
    if (!code || Array.isArray(code)) throw new Error("缺少主题代码");
    const detail = await buildFundTopicDetail(code);
    res.status(200).json({
      configured: true,
      ...detail,
    });
  } catch (error) {
    res.status(500).json({ configured: false, error: error.message });
  }
}
