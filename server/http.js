import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildEastmoneySignals,
  fetchShanghaiCompositeDailyCandles,
  fetchShanghaiCompositeRealtimeQuote,
  buildFundDetail,
  buildFundCategories,
  buildFundMarketRankings,
  buildFundTopicDetail,
  buildFundTopics,
  searchFunds,
} from "./eastmoney.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

const app = express();

app.disable("x-powered-by");

const cacheStore = {
  fundCategories: {
    value: null,
    expiresAt: 0,
    inFlight: null,
    refreshedAt: null,
  },
  fundTopics: {
    value: null,
    expiresAt: 0,
    inFlight: null,
    refreshedAt: null,
  },
  fundMarketRankings: {
    value: null,
    expiresAt: 0,
    inFlight: null,
    refreshedAt: null,
  },
  fundTopicDetails: new Map(),
  fundDetails: new Map(),
};

function sendJson(res, payload, status = 200, cacheControl = "public, max-age=120") {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cacheControl);
  res.status(status).json(payload);
}

function formatShanghaiTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

async function getCachedFundCategories(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cacheStore.fundCategories.value && cacheStore.fundCategories.expiresAt > now) {
    return cacheStore.fundCategories.value;
  }

  if (!forceRefresh && cacheStore.fundCategories.inFlight) {
    return cacheStore.fundCategories.inFlight;
  }

  cacheStore.fundCategories.inFlight = buildFundCategories()
    .then((categories) => {
      cacheStore.fundCategories.value = categories;
      cacheStore.fundCategories.expiresAt = Date.now() + 60 * 1000;
      cacheStore.fundCategories.refreshedAt = formatShanghaiTimestamp();
      return categories;
    })
    .finally(() => {
      cacheStore.fundCategories.inFlight = null;
    });

  return cacheStore.fundCategories.inFlight;
}

async function getCachedFundTopics(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cacheStore.fundTopics.value && cacheStore.fundTopics.expiresAt > now) {
    return cacheStore.fundTopics.value;
  }

  if (!forceRefresh && cacheStore.fundTopics.inFlight) {
    return cacheStore.fundTopics.inFlight;
  }

  cacheStore.fundTopics.inFlight = buildFundTopics()
    .then((topics) => {
      cacheStore.fundTopics.value = topics;
      cacheStore.fundTopics.expiresAt = Date.now() + 60 * 1000;
      cacheStore.fundTopics.refreshedAt = formatShanghaiTimestamp();
      return topics;
    })
    .finally(() => {
      cacheStore.fundTopics.inFlight = null;
    });

  return cacheStore.fundTopics.inFlight;
}

async function getCachedFundMarketRankings(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cacheStore.fundMarketRankings.value && cacheStore.fundMarketRankings.expiresAt > now) {
    return cacheStore.fundMarketRankings.value;
  }

  if (!forceRefresh && cacheStore.fundMarketRankings.inFlight) {
    return cacheStore.fundMarketRankings.inFlight;
  }

  cacheStore.fundMarketRankings.inFlight = buildFundMarketRankings()
    .then((rankings) => {
      cacheStore.fundMarketRankings.value = rankings;
      cacheStore.fundMarketRankings.expiresAt = Date.now() + 60 * 1000;
      cacheStore.fundMarketRankings.refreshedAt = rankings.refreshedAt || formatShanghaiTimestamp();
      return rankings;
    })
    .finally(() => {
      cacheStore.fundMarketRankings.inFlight = null;
    });

  return cacheStore.fundMarketRankings.inFlight;
}

function getTopicDetailCacheEntry(code) {
  if (!cacheStore.fundTopicDetails.has(code)) {
    cacheStore.fundTopicDetails.set(code, {
      value: null,
      expiresAt: 0,
      inFlight: null,
    });
  }
  return cacheStore.fundTopicDetails.get(code);
}

async function getCachedFundTopicDetail(code, forceRefresh = false) {
  const entry = getTopicDetailCacheEntry(code);
  const now = Date.now();
  const hasStableTrend =
    entry.value?.trendGranularity === "intraday" ||
    entry.value?.trendGranularity === "previous_intraday" ||
    entry.value?.intradayFallback;
  if (!forceRefresh && entry.value && entry.expiresAt > now && hasStableTrend) {
    return entry.value;
  }

  if (!forceRefresh && entry.inFlight) {
    return entry.inFlight;
  }

  entry.inFlight = buildFundTopicDetail(code)
    .then((detail) => {
      const previous = entry.value;
      const nextDetail =
        !detail?.intraday?.length && previous?.intraday?.length
          ? {
              ...detail,
              intraday: previous.intraday,
              intradaySessionDate: previous.intradaySessionDate,
              trendGranularity: previous.trendGranularity || detail.trendGranularity,
              intradayFallback: true,
            }
          : {
              ...detail,
              intradayFallback: false,
            };
      entry.value = nextDetail;
      entry.expiresAt = Date.now() + 60 * 1000;
      return nextDetail;
    })
    .catch((error) => {
      if (entry.value) {
        return {
          ...entry.value,
          intradayFallback: Boolean(entry.value?.intraday?.length),
        };
      }
      throw error;
    })
    .finally(() => {
      entry.inFlight = null;
    });

  return entry.inFlight;
}

function getFundDetailCacheEntry(code) {
  if (!cacheStore.fundDetails.has(code)) {
    cacheStore.fundDetails.set(code, {
      value: null,
      expiresAt: 0,
      inFlight: null,
    });
  }
  return cacheStore.fundDetails.get(code);
}

async function getCachedFundDetail(code, forceRefresh = false) {
  const entry = getFundDetailCacheEntry(code);
  const now = Date.now();
  if (!forceRefresh && entry.value && entry.expiresAt > now) {
    return entry.value;
  }
  if (!forceRefresh && entry.inFlight) {
    return entry.inFlight;
  }
  entry.inFlight = buildFundDetail(code)
    .then((detail) => {
      entry.value = detail;
      entry.expiresAt = Date.now() + 60 * 1000;
      return detail;
    })
    .catch((error) => {
      if (entry.value) return entry.value;
      throw error;
    })
    .finally(() => {
      entry.inFlight = null;
    });
  return entry.inFlight;
}

app.get("/api/eastmoney/market-signals", async (_req, res) => {
  try {
    const signals = await buildEastmoneySignals();
    sendJson(res, {
      configured: true,
      source: "东方财富指数 K 线公开数据",
      count: signals.length,
      signals,
    }, 200, "public, max-age=300, stale-while-revalidate=600");
  } catch (error) {
    sendJson(res, { configured: false, signals: [], error: error.message }, 500, "no-store");
  }
});

app.get("/api/eastmoney/shanghai-composite-daily", async (_req, res) => {
  try {
    const payload = await fetchShanghaiCompositeDailyCandles();
    sendJson(res, { configured: true, ...payload }, 200, "no-store");
  } catch (error) {
    sendJson(res, { configured: false, candles: [], error: error.message }, 500, "no-store");
  }
});

app.get("/api/eastmoney/shanghai-composite-quote", async (_req, res) => {
  try {
    const quote = await fetchShanghaiCompositeRealtimeQuote();
    sendJson(res, { configured: true, quote }, 200, "no-store");
  } catch (error) {
    sendJson(res, { configured: false, quote: null, error: error.message }, 500, "no-store");
  }
});

app.get("/api/eastmoney/fund-categories", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "1";
    const categories = await getCachedFundCategories(forceRefresh);
    sendJson(res, {
      configured: true,
      source: "天天基金公开排行数据",
      categories,
      refreshedAt: cacheStore.fundCategories.refreshedAt || formatShanghaiTimestamp(),
    }, 200, "no-store");
  } catch (error) {
    sendJson(res, { configured: false, categories: [], error: error.message }, 500, "no-store");
  }
});

app.get("/api/eastmoney/fund-topics", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "1";
    const topics = await getCachedFundTopics(forceRefresh);
    sendJson(res, {
      configured: true,
      source: "天天基金主题基金公开数据",
      topics,
      refreshedAt: cacheStore.fundTopics.refreshedAt || formatShanghaiTimestamp(),
    }, 200, "no-store");
  } catch (error) {
    sendJson(res, { configured: false, topics: [], error: error.message }, 500, "no-store");
  }
});

app.get("/api/eastmoney/fund-market-rankings", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "1";
    const rankings = await getCachedFundMarketRankings(forceRefresh);
    sendJson(res, {
      configured: true,
      ...rankings,
      refreshedAt: rankings.refreshedAt || cacheStore.fundMarketRankings.refreshedAt || formatShanghaiTimestamp(),
    }, 200, "no-store");
  } catch (error) {
    sendJson(res, {
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
    }, 500, "no-store");
  }
});

app.get("/api/eastmoney/fund-search", async (req, res) => {
  const keyword = req.query.keyword;
  if (!keyword || typeof keyword !== "string") {
    sendJson(res, { configured: false, funds: [], error: "缺少搜索关键词" }, 400, "no-store");
    return;
  }

  try {
    const funds = await searchFunds(keyword);
    sendJson(res, {
      configured: true,
      funds,
      source: "天天基金公开基金搜索",
    }, 200, "no-store");
  } catch (error) {
    sendJson(res, { configured: false, funds: [], error: error.message }, 500, "no-store");
  }
});

app.get("/api/eastmoney/fund-topic-detail", async (req, res) => {
  const code = req.query.code;
  const forceRefresh = req.query.refresh === "1";
  if (!code || typeof code !== "string") {
    sendJson(res, { configured: false, error: "缺少主题代码" }, 400, "no-store");
    return;
  }

  try {
    const detail = await getCachedFundTopicDetail(code, forceRefresh);
    sendJson(res, { configured: true, ...detail }, 200, "no-store");
  } catch (error) {
    sendJson(res, { configured: false, error: error.message }, 500, "no-store");
  }
});

app.get("/api/eastmoney/fund-detail", async (req, res) => {
  const code = req.query.code;
  const forceRefresh = req.query.refresh === "1";
  if (!code || typeof code !== "string") {
    sendJson(res, { configured: false, error: "缺少基金代码" }, 400, "no-store");
    return;
  }

  try {
    const detail = await getCachedFundDetail(code, forceRefresh);
    sendJson(res, { configured: true, ...detail }, 200, "no-store");
  } catch (error) {
    sendJson(res, { configured: false, error: error.message }, 500, "no-store");
  }
});

app.get("/api/yahoo/*path", async (req, res) => {
  try {
    const pathParts = Array.isArray(req.params.path) ? req.params.path : [req.params.path].filter(Boolean);
    const upstreamUrl = new URL(`https://query1.finance.yahoo.com/${pathParts.join("/")}`);
    Object.entries(req.query).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((entry) => upstreamUrl.searchParams.append(key, entry));
      } else if (value !== undefined) {
        upstreamUrl.searchParams.set(key, String(value));
      }
    });

    const response = await fetch(upstreamUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    const contentType = response.headers.get("content-type") || "application/json; charset=utf-8";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    res.status(response.status).send(await response.text());
  } catch (error) {
    sendJson(res, { error: error.message }, 500, "no-store");
  }
});

app.get("/healthz", (_req, res) => {
  res.status(200).send("ok");
});

app.use(express.static(distDir, { index: false, maxAge: "1h" }));

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

const port = Number(process.env.PORT) || 3000;

app.listen(port, "0.0.0.0", () => {
  console.log(`Market dashboard server listening on http://0.0.0.0:${port}`);
  getCachedFundTopics()
    .then((topics) => {
      console.log(`Fund topics cache warmed with ${topics.length} records`);
    })
    .catch((error) => {
      console.error("Fund topics warmup failed:", error?.message || error);
    });
});
