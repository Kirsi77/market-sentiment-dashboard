import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildEastmoneySignals,
  buildFundCategories,
  buildFundTopicDetail,
  buildFundTopics,
} from "./eastmoney.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

const app = express();

app.disable("x-powered-by");

function sendJson(res, payload, status = 200, cacheControl = "public, max-age=120") {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cacheControl);
  res.status(status).json(payload);
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

app.get("/api/eastmoney/fund-categories", async (_req, res) => {
  try {
    const categories = await buildFundCategories();
    sendJson(res, {
      configured: true,
      source: "天天基金公开排行数据",
      categories,
    }, 200, "public, max-age=900, stale-while-revalidate=1800");
  } catch (error) {
    sendJson(res, { configured: false, categories: [], error: error.message }, 500, "no-store");
  }
});

app.get("/api/eastmoney/fund-topics", async (_req, res) => {
  try {
    const topics = await buildFundTopics();
    sendJson(res, {
      configured: true,
      source: "天天基金主题基金公开数据",
      topics,
    }, 200, "public, max-age=900, stale-while-revalidate=1800");
  } catch (error) {
    sendJson(res, { configured: false, topics: [], error: error.message }, 500, "no-store");
  }
});

app.get("/api/eastmoney/fund-topic-detail", async (req, res) => {
  const code = req.query.code;
  if (!code || typeof code !== "string") {
    sendJson(res, { configured: false, error: "缺少主题代码" }, 400, "no-store");
    return;
  }

  try {
    const detail = await buildFundTopicDetail(code);
    sendJson(res, { configured: true, ...detail }, 200, "public, max-age=300, stale-while-revalidate=600");
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
});
