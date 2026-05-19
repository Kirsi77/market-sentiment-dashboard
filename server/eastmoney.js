import { execFile } from "node:child_process";
import dns from "node:dns";
import { promisify } from "node:util";
import vm from "node:vm";

const execFileAsync = promisify(execFile);
dns.setDefaultResultOrder?.("ipv4first");

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function labelForScore(score) {
  if (score < 25) return "极度恐惧";
  if (score < 45) return "恐惧";
  if (score < 56) return "中性";
  if (score < 76) return "贪婪";
  return "极度贪婪";
}

function pctChange(current, previous) {
  if (!previous) return 0;
  return ((current - previous) / previous) * 100;
}

function scoreFromReturn(value, sensitivity = 7) {
  return Math.round(clamp(50 + value * sensitivity));
}

function parseJsonp(text) {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  const start = trimmed.indexOf("(");
  const end = trimmed.lastIndexOf(")");
  const jsonText = start >= 0 && end > start ? trimmed.slice(start + 1, end) : trimmed;
  return JSON.parse(jsonText);
}

async function requestText(url, headers = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } catch (fetchError) {
    const args = ["-L", "--compressed", "-sS", "--max-time", String(Math.ceil(timeoutMs / 1000)), String(url)];
    for (const [key, value] of Object.entries(headers)) {
      args.push("-H", `${key}: ${value}`);
    }
    const curlBinary = process.platform === "win32" ? "curl.exe" : "/usr/bin/curl";
    try {
      const { stdout } = await execFileAsync(curlBinary, args, { maxBuffer: 20 * 1024 * 1024, timeout: timeoutMs + 1500 });
      return stdout;
    } catch {
      throw fetchError;
    }
  } finally {
    clearTimeout(timer);
  }
}

async function requestJson(url, headers = {}) {
  return JSON.parse(await requestText(url, headers));
}

function evaluateScript(text, exportNames) {
  const context = {};
  vm.createContext(context);
  vm.runInContext(String(text).replace(/^\uFEFF/, ""), context, { timeout: 1000 });
  return Object.fromEntries(exportNames.map((name) => [name, context[name] ?? null]));
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function quarterMonthFromDate(dateText) {
  const date = new Date(`${dateText}T00:00:00+08:00`);
  const month = date.getUTCMonth() + 1;
  return month <= 3 ? 3 : month <= 6 ? 6 : month <= 9 ? 9 : 12;
}

function quarterLabel(dateText) {
  if (!dateText) return "";
  return `${dateText.slice(0, 4)} 年 ${quarterMonthFromDate(dateText)} 月末`;
}

function previousQuarterDate(dateText) {
  const [yearText, monthText] = String(dateText || "").split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!year || !month) return null;
  const currentQuarter = quarterMonthFromDate(dateText);
  const previousQuarter = currentQuarter === 3 ? 12 : currentQuarter - 3;
  const previousYear = currentQuarter === 3 ? year - 1 : year;
  const previousMonthText = String(previousQuarter).padStart(2, "0");
  const endDay = previousQuarter === 3 ? "31" : previousQuarter === 6 ? "30" : previousQuarter === 9 ? "30" : "31";
  return `${previousYear}-${previousMonthText}-${endDay}`;
}

function formatShanghaiDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getShanghaiDateTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const pick = (type) => parts.find((item) => item.type === type)?.value ?? "";
  return {
    date: `${pick("year")}-${pick("month")}-${pick("day")}`,
    minutes: Number(pick("hour")) * 60 + Number(pick("minute")),
  };
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function previousBusinessDate(dateText) {
  let current = addDays(dateText, -1);
  while ([0, 6].includes(new Date(`${current}T00:00:00Z`).getUTCDay())) {
    current = addDays(current, -1);
  }
  return current;
}

function expectedMarketSessionDate(date = new Date()) {
  const { date: shanghaiDate, minutes } = getShanghaiDateTimeParts(date);
  const weekday = new Date(`${shanghaiDate}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return previousBusinessDate(shanghaiDate);
  if (minutes < 9 * 60 + 25) return previousBusinessDate(shanghaiDate);
  return shanghaiDate;
}

function trendGranularityForSession(sessionDate) {
  if (!sessionDate) return "intraday";
  return sessionDate < expectedMarketSessionDate() ? "previous_intraday" : "intraday";
}

function formatShanghaiTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const pick = (type) => parts.find((item) => item.type === type)?.value ?? "";
  return `${pick("month")}/${pick("day")} ${pick("hour")}:${pick("minute")}:${pick("second")}`;
}

function parseEastmoneyKlines(payload) {
  return (payload?.data?.klines || [])
    .map((line) => {
      const [date, open, close, high, low, volume, amount, amplitude, changePct] = line.split(",");
      return {
        date,
        open: Number(open),
        close: Number(close),
        high: Number(high),
        low: Number(low),
        volume: Number(volume),
        amount: Number(amount),
        changePct: Number(changePct),
      };
    })
    .filter((row) => Number.isFinite(row.close));
}

function scoreFromIndex(points, sensitivity = 7) {
  const latest = points.at(-1);
  const monthAgo = points.at(-22) || points[0];
  const ma60 = points.slice(-60).reduce((sum, item) => sum + item.close, 0) / Math.min(points.length, 60);
  const monthReturn = monthAgo ? pctChange(latest.close, monthAgo.close) : 0;
  const maDistance = ma60 ? pctChange(latest.close, ma60) : 0;
  return Math.round(clamp(50 + monthReturn * sensitivity + maDistance * 4));
}

function previousScoreFromIndex(points, sensitivity = 7) {
  if (points.length < 31) return scoreFromIndex(points, sensitivity);
  return scoreFromIndex(points.slice(0, -1), sensitivity);
}

function rangeScoresFromIndex(points, sensitivity = 7) {
  const scoreAt = (sourcePoints, offset) => {
    const latest = sourcePoints.at(-1);
    const previous = sourcePoints.at(-1 - offset) || sourcePoints[0] || latest;
    return scoreFromReturn(pctChange(latest.close, previous.close), sensitivity);
  };
  const previousPoints = points.slice(0, -1);
  return {
    rangeScores: {
      "1D": scoreAt(points, 1),
      "1W": scoreAt(points, 5),
      "1M": scoreAt(points, 22),
      "1Y": scoreAt(points, 252),
    },
    previousRangeScores: {
      "1D": scoreAt(previousPoints, 1),
      "1W": scoreAt(previousPoints, 5),
      "1M": scoreAt(previousPoints, 22),
      "1Y": scoreAt(previousPoints, 252),
    },
  };
}

async function fetchEastmoneyIndex({ secid, key, name, signalName, detailName, sensitivity }) {
  const url = new URL("https://push2his.eastmoney.com/api/qt/stock/kline/get");
  url.search = new URLSearchParams({
    secid,
    fields1: "f1,f2,f3,f4,f5,f6",
    fields2: "f51,f52,f53,f54,f55,f56,f57,f58",
    klt: "101",
    fqt: "1",
    beg: "20250101",
    end: "20500101",
  }).toString();
  const points = parseEastmoneyKlines(await requestJson(url, {
    Referer: "https://quote.eastmoney.com/",
    "User-Agent": "Mozilla/5.0",
  }));
  if (points.length < 30) throw new Error(`${name} K 线不足`);
  const latest = points.at(-1);
  const monthAgo = points.at(-22) || points[0];
  const monthReturn = monthAgo ? pctChange(latest.close, monthAgo.close) : 0;
  const score = scoreFromIndex(points, sensitivity);
  return {
    key,
    name: signalName,
    value: labelForScore(score),
    score,
    previousScore: previousScoreFromIndex(points, sensitivity),
    ...rangeScoresFromIndex(points, sensitivity),
    detail: `${detailName}近 1 个月涨跌幅 ${monthReturn.toFixed(2)}%，最新收盘 ${latest.close.toFixed(2)}。`,
  };
}

export async function fetchShanghaiCompositeDailyCandles() {
  const url = new URL("https://push2his.eastmoney.com/api/qt/stock/kline/get");
  url.search = new URLSearchParams({
    secid: "1.000001",
    fields1: "f1,f2,f3,f4,f5,f6",
    fields2: "f51,f52,f53,f54,f55,f56,f57,f58",
    klt: "101",
    fqt: "1",
    beg: "20250101",
    end: "20500101",
  }).toString();
  const points = parseEastmoneyKlines(await requestJson(url, {
    Referer: "https://quote.eastmoney.com/",
    "User-Agent": "Mozilla/5.0",
  }));
  if (points.length < 2) throw new Error("上证综指日 K 线不足");
  return {
    candles: points,
    refreshedAt: formatShanghaiTimestamp(),
    source: "东方财富上证综指日 K 线公开数据",
  };
}

export async function fetchShanghaiCompositeRealtimeQuote() {
  const url = new URL("https://push2.eastmoney.com/api/qt/stock/get");
  url.search = new URLSearchParams({
    secid: "1.000001",
    fields: "f43,f44,f45,f46,f47,f48,f57,f58,f59,f60,f86,f169,f170",
  }).toString();
  const payload = await requestJson(url, {
    Referer: "https://quote.eastmoney.com/",
    "User-Agent": "Mozilla/5.0",
  });
  const data = payload?.data || {};
  const decimals = Number.isFinite(Number(data.f59)) ? Number(data.f59) : 2;
  const divisor = 10 ** decimals;
  const latest = Number(data.f43) / divisor;
  const previousClose = Number(data.f60) / divisor;
  const change = Number(data.f169) / divisor;
  const changePercent = Number(data.f170) / 100;
  if (!Number.isFinite(latest)) throw new Error("上证综指实时行情不可用");
  return {
    code: data.f57 || "000001",
    name: data.f58 || "上证指数",
    close: latest,
    previousClose: Number.isFinite(previousClose) ? previousClose : null,
    change: Number.isFinite(change) ? change : null,
    changePercent: Number.isFinite(changePercent) ? changePercent : null,
    timestamp: Number(data.f86) || Math.floor(Date.now() / 1000),
    date: formatShanghaiDate(new Date((Number(data.f86) || Math.floor(Date.now() / 1000)) * 1000)),
    refreshedAt: formatShanghaiTimestamp(),
    source: "东方财富上证综指实时行情公开数据",
  };
}

export async function buildEastmoneySignals() {
  const configs = [
    { secid: "1.000300", key: "em_hs300", name: "沪深300", signalName: "沪深300确认", detailName: "沪深300", sensitivity: 7 },
    { secid: "0.399006", key: "em_chinext", name: "创业板指", signalName: "创业板风险偏好", detailName: "创业板指", sensitivity: 6 },
    { secid: "1.000688", key: "em_star50", name: "科创50", signalName: "科创成长动能", detailName: "科创50", sensitivity: 6 },
    { secid: "1.000852", key: "em_zz1000", name: "中证1000", signalName: "小盘股情绪", detailName: "中证1000", sensitivity: 6 },
  ];
  const results = await Promise.allSettled(configs.map(fetchEastmoneyIndex));
  return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}

function parseRankData(text) {
  const match = text.match(/datas:\[(.*?)]\s*,allRecords/s);
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]*)"/g)].map((item) => item[1].split(","));
}

async function fetchOpenFundRanking({ sort, order = "desc", size = 10 }) {
  const url = new URL("https://fund.eastmoney.com/data/rankhandler.aspx");
  url.search = new URLSearchParams({
    op: "ph",
    dt: "kf",
    ft: "all",
    rs: "",
    gs: "0",
    sc: sort,
    st: order,
    sd: "",
    ed: "",
    qdii: "",
    tabSubtype: ",,,,,",
    pi: "1",
    pn: String(size),
    dx: "1",
    v: String(Date.now()),
  }).toString();
  const rows = parseRankData(await requestText(url, {
    Referer: "https://fund.eastmoney.com/data/fundranking.html",
    "User-Agent": "Mozilla/5.0",
  }));
  return rows.map((row) => ({
    code: row[0],
    name: row[1],
    navDate: row[3],
    unitNav: Number(row[4]),
    cumulativeNav: Number(row[5]),
    dayChange: Number(row[6]),
    week: Number(row[7]),
    month: Number(row[8]),
    quarter: Number(row[9]),
    halfYear: Number(row[10]),
    year: Number(row[11]),
    yearToDate: Number(row[14]),
    since: Number(row[15]),
    subscriptionStatus: row[20] === "1" ? "开放申购" : row[20] || "--",
    raw: row,
  })).filter((item) => item.code && item.name && Number.isFinite(item.dayChange));
}

export async function buildFundMarketRankings() {
  const [gainers, losers] = await Promise.all([
    fetchOpenFundRanking({ sort: "rzdf", order: "desc", size: 10 }),
    fetchOpenFundRanking({ sort: "rzdf", order: "asc", size: 10 }),
  ]);
  const dataDate = gainers.find((item) => item.navDate)?.navDate || losers.find((item) => item.navDate)?.navDate || null;
  return {
    gainers,
    losers,
    purchases: [],
    sales: [],
    unavailable: {
      purchases: "公开接口未提供全市场真实申购量排名，暂不展示伪数据。",
      sales: "公开接口未提供全市场真实赎回量排名，暂不展示伪数据。",
    },
    dataDate,
    refreshedAt: formatShanghaiTimestamp(),
    source: "天天基金全市场开放式基金排行",
  };
}

export async function searchFunds(keyword) {
  const query = String(keyword || "").trim();
  if (query.length < 1) return [];
  const url = new URL("https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx");
  url.search = new URLSearchParams({
    m: "1",
    key: query,
  }).toString();
  const payload = await requestJson(url, {
    Referer: "https://fund.eastmoney.com/",
    "User-Agent": "Mozilla/5.0",
  });
  return (payload?.Datas || [])
    .filter((item) => item?.CATEGORYDESC === "基金" && item.CODE && item.NAME)
    .slice(0, 12)
    .map((item) => ({
      code: item.CODE,
      name: stripHtml(item.NAME),
      shortName: stripHtml(item.FundBaseInfo?.SHORTNAME || item.NAME),
      type: item.FundBaseInfo?.FTYPE || item.FundBaseInfo?.FUNDTYPE || "",
      manager: stripHtml(item.FundBaseInfo?.JJGS || ""),
      pinyin: item.JP || "",
    }));
}

async function fetchFundCategory({ key, label, type }) {
  const url = new URL("https://fund.eastmoney.com/data/rankhandler.aspx");
  url.search = new URLSearchParams({
    op: "ph",
    dt: "kf",
    ft: type,
    rs: "",
    gs: "0",
    sc: "1yzf",
    st: "desc",
    sd: "",
    ed: "",
    qdii: "",
    tabSubtype: ",,,,,",
    pi: "1",
    pn: "30",
    dx: "1",
    v: String(Date.now()),
  }).toString();
  const rows = parseRankData(await requestText(url, {
    Referer: "https://fund.eastmoney.com/data/fundranking.html",
    "User-Agent": "Mozilla/5.0",
  }));
  if (!rows.length) throw new Error(`${label} 暂无基金排行数据`);
  const sampleRows = rows.slice(0, 30);
  const avgColumn = (index) => {
    const values = sampleRows.map((row) => Number(row[index])).filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  return {
    key,
    label,
    dayAvg: avgColumn(6),
    weekAvg: avgColumn(7),
    monthAvg: avgColumn(8),
    quarterAvg: avgColumn(9),
    yearAvg: avgColumn(11),
    topFunds: rows.slice(0, 5).map((row) => ({
      code: row[0],
      name: row[1],
      day: Number(row[6]),
      week: Number(row[7]),
      month: Number(row[8]),
      quarter: Number(row[9]),
      year: Number(row[11]),
    })),
  };
}

export async function buildFundCategories() {
  const configs = [
    { key: "gp", label: "股票型", type: "gp" },
    { key: "hh", label: "混合型", type: "hh" },
    { key: "zs", label: "指数型", type: "zs" },
    { key: "zq", label: "债券型", type: "zq" },
    { key: "qdii", label: "QDII", type: "qdii" },
    { key: "fof", label: "FOF", type: "fof" },
  ];
  const results = await Promise.allSettled(configs.map(fetchFundCategory));
  return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}

export async function fetchFundTopicDetail(topic) {
  const url = new URL("https://api.fund.eastmoney.com/ZTJJ/GetBKDetailInfoNew");
  url.search = new URLSearchParams({ callback: "fundTopic", tp: topic.INDEXCODE }).toString();
  const payload = parseJsonp(await requestText(url, {
    Referer: "https://fund.eastmoney.com/ztjj/default.html",
    "User-Agent": "Mozilla/5.0",
  }));
  if (payload.ErrCode !== 0 || !payload.Data) throw new Error(`主题 ${topic.INDEXNAME} 无详情数据`);
  const data = payload.Data;
  const monthRank = Number(data.RANKM);
  const monthTotal = Number(data.MSC);
  const dayChange = Number(data.D);
  const strengthBase = Number.isFinite(monthRank) && Number.isFinite(monthTotal) && monthTotal > 0
    ? 100 - ((monthRank - 1) / monthTotal) * 100
    : 50;
  return {
    code: data.INDEXCODE || topic.INDEXCODE,
    name: data.INDEXNAME || topic.INDEXNAME,
    dayChange,
    week: Number(data.W),
    month: Number(data.M),
    quarter: Number(data.Q),
    year: Number(data.Y),
    yearToDate: Number(data.SY),
    monthRank,
    monthTotal,
    quarterRank: Number(data.RANKQ),
    quarterTotal: Number(data.QSC),
    strength: clamp(strengthBase + Math.max(0, dayChange || 0) * 1.2),
  };
}

export async function buildFundTopics() {
  const url = new URL("https://api.fund.eastmoney.com/ZTJJ/GetBKListByBKTypeNew");
  url.search = new URLSearchParams({ callback: "fundTopics" }).toString();
  const payload = parseJsonp(await requestText(url, {
    Referer: "https://fund.eastmoney.com/ztjj/default.html",
    "User-Agent": "Mozilla/5.0",
  }));
  if (payload.ErrCode !== 0 || !payload.Data) throw new Error("主题列表不可用");
  const selected = [...(payload.Data.gn || []), ...(payload.Data.hy1 || [])].filter((topic, index, list) => (
    topic.INDEXCODE && list.findIndex((item) => item.INDEXCODE === topic.INDEXCODE) === index
  ));
  const results = [];
  const concurrency = 12;
  for (let index = 0; index < selected.length; index += concurrency) {
    const chunk = selected.slice(index, index + concurrency);
    results.push(...await Promise.allSettled(chunk.map(fetchFundTopicDetail)));
  }
  return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}

async function fetchTopicFunds(topicCode) {
  const url = new URL("https://api.fund.eastmoney.com/ZTJJ/GetBKRelTopicFundNew");
  url.search = new URLSearchParams({
    callback: "topicFunds",
    sort: "RZDF",
    sorttype: "DESC",
    pageindex: "1",
    pagesize: "20",
    tp: topicCode,
    isbuy: "0",
  }).toString();
  const payload = parseJsonp(await requestText(url, {
    Referer: "https://fund.eastmoney.com/ztjj/default.html",
    "User-Agent": "Mozilla/5.0",
  }));
  if (payload.ErrCode !== 0 || !payload.Data) return [];
  const baseFunds = payload.Data.map((item) => ({
    code: item.FCODE,
    name: item.SHORTNAME,
    dayChange: Number(item.RZDF),
    week: Number(item.SYL_Z),
    month: Number(item.SYL_Y),
    quarter: Number(item.SYL_3Y),
    yearToDate: Number(item.SYL_JN),
    type: item.FTYPE,
    navDate: item.SYRQ,
  }));
  const estimateResults = await Promise.allSettled(baseFunds.map((fund) => fetchFundEstimate(fund.code)));
  const estimateMap = new Map(
    estimateResults.flatMap((result) => (
      result.status === "fulfilled" && result.value?.code
        ? [[result.value.code, result.value]]
        : []
    )),
  );
  return baseFunds.map((fund) => {
    const estimate = estimateMap.get(fund.code);
    const estimatedChange = Number.isFinite(estimate?.estimatedChange) ? estimate.estimatedChange : null;
    return {
      ...fund,
      previousDayChange: fund.dayChange,
      dayChange: estimatedChange ?? fund.dayChange,
      estimatedChange,
      navDate: estimate?.estimateTime || estimate?.navDate || fund.navDate,
    };
  });
}

async function fetchTopicStocks(topicCode) {
  const url = new URL("https://api.fund.eastmoney.com/ZTJJ/GetBKRelSTOCKNew");
  url.search = new URLSearchParams({
    callback: "topicStocks",
    sort: "CYBL",
    sorttype: "desc",
    date: "2026-03-31",
    pageindex: "1",
    pagesize: "6",
    tp: topicCode,
  }).toString();
  const payload = parseJsonp(await requestText(url, {
    Referer: "https://fund.eastmoney.com/ztjj/default.html",
    "User-Agent": "Mozilla/5.0",
  }));
  if (payload.ErrCode !== 0 || !payload.Data) return [];
  return payload.Data.map((item) => ({
    code: item.SCODE,
    name: item.SNAME,
    market: String(item.NEWTEXCH ?? item.TEXCH ?? ""),
    fundCount: Number(item.FUNDNUM),
    fundHoldingRatio: Number(item.CYBL),
  }));
}

async function fetchFundPingData(fundCode) {
  const url = `https://fund.eastmoney.com/pingzhongdata/${fundCode}.js?v=${Date.now()}`;
  const script = await requestText(url, {
    Referer: `https://fund.eastmoney.com/${fundCode}.html`,
    "User-Agent": "Mozilla/5.0",
  });
  const payload = evaluateScript(script, [
    "fS_name",
    "fS_code",
    "Data_netWorthTrend",
    "Data_ACWorthTrend",
    "Data_grandTotal",
    "Data_assetAllocation",
    "Data_holderStructure",
    "stockCodesNew",
    "Data_fundSharesPositions",
    "syl_1y",
    "syl_3y",
    "syl_6y",
    "syl_1n",
  ]);
  const netWorthTrend = Array.isArray(payload.Data_netWorthTrend)
    ? payload.Data_netWorthTrend
        .map((item) => ({
          date: formatShanghaiDate(new Date(item.x)),
          timestamp: Number(item.x),
          nav: Number(item.y),
          dailyChange: Number(item.equityReturn),
        }))
        .filter((item) => Number.isFinite(item.nav))
    : [];
  const performanceSeries = Array.isArray(payload.Data_grandTotal)
    ? payload.Data_grandTotal.map((series) => ({
        name: series.name,
        points: Array.isArray(series.data)
          ? series.data
              .map((point) => ({
                timestamp: Number(point[0]),
                date: formatShanghaiDate(new Date(point[0])),
                value: Number(point[1]),
              }))
              .filter((point) => Number.isFinite(point.value))
          : [],
      }))
    : [];
  return {
    code: payload.fS_code || fundCode,
    name: payload.fS_name || fundCode,
    netWorthTrend,
    acWorthTrend: Array.isArray(payload.Data_ACWorthTrend) ? payload.Data_ACWorthTrend : [],
    performanceSeries,
    assetAllocation: payload.Data_assetAllocation || null,
    holderStructure: payload.Data_holderStructure || null,
    stockCodesNew: Array.isArray(payload.stockCodesNew) ? payload.stockCodesNew : [],
    sharesPositions: Array.isArray(payload.Data_fundSharesPositions) ? payload.Data_fundSharesPositions : [],
    returns: {
      month: Number(payload.syl_1y),
      quarter: Number(payload.syl_3y),
      halfYear: Number(payload.syl_6y),
      year: Number(payload.syl_1n),
    },
  };
}

async function fetchFundEstimate(fundCode) {
  const url = `https://fundgz.1234567.com.cn/js/${fundCode}.js`;
  const payload = parseJsonp(await requestText(url, {
    Referer: `https://fund.eastmoney.com/${fundCode}.html`,
    "User-Agent": "Mozilla/5.0",
  }));
  return {
    code: payload.fundcode || fundCode,
    name: payload.name || fundCode,
    navDate: payload.jzrq || null,
    latestNav: Number(payload.dwjz),
    estimatedNav: Number(payload.gsz),
    estimatedChange: Number(payload.gszzl),
    estimateTime: payload.gztime || null,
  };
}

async function fetchFundHoldingsForQuarter(fundCode, quarterDate) {
  if (!quarterDate) return { date: null, holdings: [] };
  const year = quarterDate.slice(0, 4);
  const month = String(quarterMonthFromDate(quarterDate));
  const url = new URL("https://fundf10.eastmoney.com/FundArchivesDatas.aspx");
  url.search = new URLSearchParams({
    type: "jjcc",
    code: fundCode,
    topline: "10",
    year,
    month,
    rt: String(Date.now() / 1000),
  }).toString();
  const script = await requestText(url, {
    Referer: `https://fundf10.eastmoney.com/ccmx_${fundCode}.html`,
    "User-Agent": "Mozilla/5.0",
  });
  const { apidata } = evaluateScript(script, ["apidata"]);
  const html = apidata?.content || "";
  const cutoffMatch = html.match(/截止至：<font[^>]*>([^<]+)<\/font>/);
  const holdings = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map((rowMatch) => {
      const rowHtml = rowMatch[1];
      const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => stripHtml(cell[1]));
      if (cells.length < 9 || !/^\d+\*?$/.test(cells[0])) return null;
      const secidMatch = rowHtml.match(/unify\/r\/(\d\.\d{6})/);
      return {
        rank: Number.parseInt(cells[0], 10),
        code: cells[1],
        name: cells[2],
        weight: Number(cells[6].replace("%", "")),
        sharesWan: Number(cells[7].replace(/,/g, "")),
        marketValueWan: Number(cells[8].replace(/,/g, "")),
        secid: secidMatch?.[1] || "",
      };
    })
    .filter(Boolean);
  return {
    date: cutoffMatch?.[1] || quarterDate,
    holdings,
  };
}

async function fetchStockQuotes(secids) {
  const uniqueSecids = [...new Set(secids.filter(Boolean))];
  if (!uniqueSecids.length) return new Map();
  const url = new URL("https://push2.eastmoney.com/api/qt/ulist.np/get");
  url.search = new URLSearchParams({
    fltt: "2",
    invt: "2",
    fields: "f12,f14,f2,f3",
    secids: uniqueSecids.join(","),
  }).toString();
  const payload = await requestJson(url, {
    Referer: "https://quote.eastmoney.com/",
    "User-Agent": "Mozilla/5.0",
  });
  return new Map(
    (payload?.data?.diff || []).map((item) => [
      String(item.f12),
      {
        code: String(item.f12),
        latestPrice: Number(item.f2),
        dayChange: Number(item.f3),
      },
    ]),
  );
}

async function fetchStockTrend(stock) {
  const secid = `${stock.market === "1" ? "1" : "0"}.${stock.code}`;
  const url = new URL("https://push2his.eastmoney.com/api/qt/stock/trends2/get");
  url.search = new URLSearchParams({
    secid,
    fields1: "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11",
    fields2: "f51,f52,f53,f54,f55,f56,f57,f58",
    iscr: "0",
    ndays: "5",
  }).toString();
  const payload = await requestJson(url, {
    Referer: "https://quote.eastmoney.com/",
    "User-Agent": "Mozilla/5.0",
  });
  const preClose = Number(payload?.data?.preClose);
  const trends = payload?.data?.trends || [];
  if (!Number.isFinite(preClose) || !trends.length) return null;
  const buckets = new Map();
  trends.forEach((line) => {
    const [timestamp, , close] = line.split(",");
    const sessionDate = timestamp.slice(0, 10);
    if (!buckets.has(sessionDate)) {
      buckets.set(sessionDate, []);
    }
    buckets.get(sessionDate).push({
      time: timestamp.slice(11, 16),
      change: pctChange(Number(close), preClose),
    });
  });
  const latestSessionDate = [...buckets.keys()].sort().at(-1);
  if (!latestSessionDate) return null;
  const points = (buckets.get(latestSessionDate) || []).filter((item) => Number.isFinite(item.change));
  if (!points.length) return null;
  return {
    sessionDate: latestSessionDate,
    points,
  };
}

function aggregateTrends(trendSets) {
  const valid = trendSets.filter((set) => Array.isArray(set?.points) && set.points.length);
  if (!valid.length) return [];
  const buckets = new Map();
  valid.forEach((set) => {
    const weight = Number.isFinite(set.weight) ? set.weight : 1;
    set.points.forEach((point) => {
      if (!point?.time || !Number.isFinite(point.change)) return;
      if (isMiddayBreakTime(point.time)) return;
      if (!buckets.has(point.time)) {
        buckets.set(point.time, []);
      }
      buckets.get(point.time).push({ change: point.change, weight });
    });
  });
  return [...buckets.entries()]
    .sort(([timeA], [timeB]) => timeA.localeCompare(timeB))
    .map(([time, entries]) => {
      const totalWeight = entries.reduce((sum, item) => sum + item.weight, 0) || entries.length || 1;
      return {
        time,
        change: entries.reduce((sum, item) => sum + item.change * item.weight, 0) / totalWeight,
      };
    });
}

function pickLatestSessionTrendSets(trendSets) {
  const valid = trendSets.filter((set) => Array.isArray(set?.points) && set.points.length && set.sessionDate);
  if (!valid.length) return [];
  const latestSessionDate = valid.map((set) => set.sessionDate).sort().at(-1);
  return valid.filter((set) => set.sessionDate === latestSessionDate);
}

function isMiddayBreakTime(label) {
  const match = String(label || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes > 11 * 60 + 30 && minutes < 13 * 60;
}

function alignTrendToLatestChange(points, latestChange) {
  if (!points.length || !Number.isFinite(latestChange)) return points;
  const latestPoint = points.at(-1);
  if (!Number.isFinite(latestPoint?.change)) return points;
  const offset = latestChange - latestPoint.change;
  return points.map((point) => ({
    ...point,
    change: Number.isFinite(point.change) ? point.change + offset : point.change,
  }));
}

function buildSeriesForPeriod(points, count, valueKey = "nav") {
  return points
    .slice(-count)
    .map((item) => ({
      date: item.date,
      value: Number(item[valueKey]),
    }))
    .filter((item) => Number.isFinite(item.value));
}

function buildPerformanceCurve(points) {
  if (!points.length) return [];
  const base = points[0].nav;
  if (!Number.isFinite(base) || !base) return [];
  return points.map((item) => ({
    date: item.date,
    value: pctChange(item.nav, base),
  }));
}

function computePeriodReturn(points, lookbackDays) {
  if (!points.length) return null;
  const latest = points.at(-1);
  const compare = lookbackDays === "ytd"
    ? points.find((item) => item.date.startsWith(latest.date.slice(0, 4))) || points[0]
    : lookbackDays === "since"
      ? points[0]
      : points.at(-1 - lookbackDays) || points[0];
  return Number.isFinite(compare?.nav) ? pctChange(latest.nav, compare.nav) : null;
}

function computeMaxDrawdown(points, valueAccessor) {
  if (!points.length) return null;
  let peak = valueAccessor(points[0]);
  let maxDrawdown = 0;
  points.forEach((point) => {
    const current = valueAccessor(point);
    if (!Number.isFinite(current) || !current) return;
    peak = Math.max(peak, current);
    maxDrawdown = Math.min(maxDrawdown, pctChange(current, peak));
  });
  return maxDrawdown;
}

function computeStageMetrics(netWorthTrend, benchmarkSeries) {
  const periods = [
    { key: "month", label: "近1月", lookback: 22 },
    { key: "quarter", label: "近3月", lookback: 66 },
    { key: "halfYear", label: "近6月", lookback: 132 },
    { key: "year", label: "近1年", lookback: 252 },
    { key: "since", label: "成立以来", lookback: "since" },
  ];
  return periods.map((period) => {
    const fundReturn = computePeriodReturn(netWorthTrend, period.lookback);
    const benchmarkReturn = benchmarkSeries.length
      ? (() => {
          const latest = benchmarkSeries.at(-1);
          const compare = period.lookback === "since"
            ? benchmarkSeries[0]
            : period.lookback === "ytd"
              ? benchmarkSeries.find((item) => item.date.startsWith(latest.date.slice(0, 4))) || benchmarkSeries[0]
              : benchmarkSeries.at(-1 - period.lookback) || benchmarkSeries[0];
          return Number.isFinite(compare?.value) ? latest.value - compare.value : null;
        })()
      : null;
    const fundSlice = period.lookback === "since" ? netWorthTrend : netWorthTrend.slice(-(Number(period.lookback) + 1));
    const benchmarkSlice = period.lookback === "since" ? benchmarkSeries : benchmarkSeries.slice(-(Number(period.lookback) + 1));
    const fundDrawdown = computeMaxDrawdown(fundSlice, (item) => item.nav);
    const benchmarkDrawdown = computeMaxDrawdown(benchmarkSlice, (item) => 100 + item.value);
    return {
      key: period.key,
      label: period.label,
      fundReturn,
      benchmarkReturn,
      excessReturn: Number.isFinite(fundReturn) && Number.isFinite(benchmarkReturn) ? fundReturn - benchmarkReturn : null,
      fundDrawdown,
      benchmarkDrawdown,
    };
  });
}

async function fetchYahooStockTrend(stock) {
  const suffix = stock.market === "1" ? "SS" : "SZ";
  const symbol = `${stock.code}.${suffix}`;
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
  url.search = new URLSearchParams({
    range: "5d",
    interval: "5m",
    includePrePost: "false",
    events: "div,splits",
  }).toString();
  const payload = await requestJson(url, {
    "User-Agent": "Mozilla/5.0",
  });
  const result = payload?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  if (!timestamps.length || !closes.length) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayInShanghai = formatter.format(new Date());
  const rows = timestamps
    .map((timestamp, index) => ({
      date: formatter.format(new Date(timestamp * 1000)),
      time: new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Shanghai",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(timestamp * 1000)),
      rawClose: closes[index],
    }))
    .filter((item) => item.rawClose !== null && item.rawClose !== undefined)
    .map((item) => ({
      ...item,
      close: Number(item.rawClose),
    }))
    .filter((item) => Number.isFinite(item.close));
  if (rows.length < 2) return null;
  const sessions = new Map();
  rows.forEach((item) => {
    if (!sessions.has(item.date)) {
      sessions.set(item.date, []);
    }
    sessions.get(item.date).push(item);
  });
  const sessionDates = [...sessions.keys()].sort();
  const fallbackSessionDate = sessionDates.at(-1);
  if (!fallbackSessionDate) return null;
  const sessionRows = sessions.get(fallbackSessionDate) || [];
  const base = sessionRows[0]?.close;
  if (!Number.isFinite(base) || !base) return null;
  return {
    sessionDate: fallbackSessionDate,
    points: sessionRows.map((item) => ({
      time: item.time,
      change: pctChange(item.close, base),
    })),
  };
}

export async function buildFundTopicDetail(topicCode) {
  const topic = await fetchFundTopicDetail({ INDEXCODE: topicCode, INDEXNAME: topicCode });
  const [funds, stocks] = await Promise.all([fetchTopicFunds(topicCode), fetchTopicStocks(topicCode)]);
  const trendResults = await Promise.allSettled(
    stocks.slice(0, 5).map(async (item) => {
      let primaryTrend = null;
      try {
        primaryTrend = await fetchStockTrend(item);
      } catch {
        primaryTrend = null;
      }
      if (primaryTrend?.points?.length) {
        return primaryTrend;
      }
      let fallbackTrend = null;
      try {
        fallbackTrend = await fetchYahooStockTrend(item);
      } catch {
        fallbackTrend = null;
      }
      return fallbackTrend?.points?.length ? fallbackTrend : null;
    }),
  );
  const effectiveTrendSets = pickLatestSessionTrendSets(
    trendResults.flatMap((result) => (result.status === "fulfilled" && result.value ? [result.value] : [])),
  );
  const intradaySessionDate = effectiveTrendSets
    .map((item) => item?.sessionDate)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  const intraday = alignTrendToLatestChange(aggregateTrends(effectiveTrendSets), topic.dayChange);
  const trendGranularity = trendGranularityForSession(intradaySessionDate);
  return {
    topic,
    funds,
    stocks,
    intraday,
    intradaySessionDate,
    trendGranularity,
    refreshedAt: formatShanghaiTimestamp(),
    source: "Fund topic data and public market price aggregates",
  };
}

export async function buildFundDetail(fundCode) {
  const [pingData, estimate] = await Promise.all([
    fetchFundPingData(fundCode),
    fetchFundEstimate(fundCode).catch(() => null),
  ]);
  const latestQuarterDate = pingData.assetAllocation?.categories?.at(-1) || pingData.netWorthTrend.at(-1)?.date || null;
  const currentHoldingsData = await fetchFundHoldingsForQuarter(fundCode, latestQuarterDate).catch(() => ({ date: latestQuarterDate, holdings: [] }));

  const quoteMap = await fetchStockQuotes(currentHoldingsData.holdings.map((item) => item.secid)).catch(() => new Map());
  const holdings = currentHoldingsData.holdings.map((item) => {
    const quote = quoteMap.get(item.code) || {};
    return {
      ...item,
      latestPrice: quote.latestPrice ?? null,
      dayChange: quote.dayChange ?? null,
    };
  });

  const trendResults = await Promise.allSettled(
    holdings
      .slice(0, 8)
      .filter((item) => item.secid)
      .map(async (item) => {
        const market = item.secid.startsWith("1.") ? "1" : "0";
        const code = item.secid.slice(2);
        let primaryTrend = null;
        try {
          primaryTrend = await fetchStockTrend({ code, market });
        } catch {
          primaryTrend = null;
        }
        if (primaryTrend?.points?.length) {
          return { ...primaryTrend, weight: Math.max(item.weight || 0, 0.1) };
        }
        let fallbackTrend = null;
        try {
          fallbackTrend = await fetchYahooStockTrend({ code, market });
        } catch {
          fallbackTrend = null;
        }
        return fallbackTrend?.points?.length ? { ...fallbackTrend, weight: Math.max(item.weight || 0, 0.1) } : null;
      }),
  );
  const effectiveTrendSets = pickLatestSessionTrendSets(
    trendResults.flatMap((result) => (result.status === "fulfilled" && result.value ? [result.value] : [])),
  );
  const intraday = aggregateTrends(effectiveTrendSets);
  const intradaySessionDate = effectiveTrendSets.map((item) => item.sessionDate).filter(Boolean).sort().at(-1) || null;
  const trendGranularity = trendGranularityForSession(intradaySessionDate);

  const benchmarkSeries = pingData.performanceSeries.find((series) => series.name?.includes("沪深300"))?.points || [];
  const navHistory = pingData.netWorthTrend.slice(-20).reverse();
  const stageMetrics = computeStageMetrics(pingData.netWorthTrend, benchmarkSeries);
  const historyCurve = buildSeriesForPeriod(pingData.netWorthTrend, 60);
  const performanceCurve = buildPerformanceCurve(pingData.netWorthTrend.slice(-60));
  const latestHistoryPoint = pingData.netWorthTrend.at(-1);

  return {
    fund: {
      code: pingData.code,
      name: pingData.name,
      latestNav: estimate?.estimatedNav || estimate?.latestNav || latestHistoryPoint?.nav || null,
      latestNavDate: estimate?.estimateTime || estimate?.navDate || latestHistoryPoint?.date || null,
      estimatedChange: estimate?.estimatedChange ?? latestHistoryPoint?.dailyChange ?? null,
      latestDailyChange: latestHistoryPoint?.dailyChange ?? null,
      month: pingData.returns.month,
      quarter: pingData.returns.quarter,
      halfYear: pingData.returns.halfYear,
      year: pingData.returns.year,
    },
    intraday,
    intradaySessionDate,
    trendGranularity,
    historyCurve,
    performanceCurve,
    navHistory,
    stageMetrics,
    holdings,
    holdingsQuarter: currentHoldingsData.date || latestQuarterDate,
    refreshedAt: formatShanghaiTimestamp(),
    source: "Eastmoney public fund data and holdings-based aggregation",
  };
}
