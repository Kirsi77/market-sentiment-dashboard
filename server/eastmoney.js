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
  const response = await fetch(url);
  if (!response.ok) throw new Error(`东方财富 ${name} HTTP ${response.status}`);
  const points = parseEastmoneyKlines(await response.json());
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
  const response = await fetch(url, {
    headers: {
      Referer: "https://fund.eastmoney.com/data/fundranking.html",
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!response.ok) throw new Error(`天天基金 ${label} HTTP ${response.status}`);
  const rows = parseRankData(await response.text());
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
  const response = await fetch(url, {
    headers: {
      Referer: "https://fund.eastmoney.com/ztjj/default.html",
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!response.ok) throw new Error(`主题 ${topic.INDEXNAME} HTTP ${response.status}`);
  const payload = parseJsonp(await response.text());
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
  const response = await fetch(url, {
    headers: {
      Referer: "https://fund.eastmoney.com/ztjj/default.html",
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!response.ok) throw new Error(`主题列表 HTTP ${response.status}`);
  const payload = parseJsonp(await response.text());
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
    sort: "SYL_Y",
    sorttype: "DESC",
    pageindex: "1",
    pagesize: "10",
    tp: topicCode,
    isbuy: "0",
  }).toString();
  const response = await fetch(url, {
    headers: {
      Referer: "https://fund.eastmoney.com/ztjj/default.html",
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!response.ok) throw new Error(`主题基金 HTTP ${response.status}`);
  const payload = parseJsonp(await response.text());
  if (payload.ErrCode !== 0 || !payload.Data) return [];
  return payload.Data.map((item) => ({
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
  const response = await fetch(url, {
    headers: {
      Referer: "https://fund.eastmoney.com/ztjj/default.html",
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!response.ok) throw new Error(`主题股票 HTTP ${response.status}`);
  const payload = parseJsonp(await response.text());
  if (payload.ErrCode !== 0 || !payload.Data) return [];
  return payload.Data.map((item) => ({
    code: item.SCODE,
    name: item.SNAME,
    market: String(item.NEWTEXCH ?? item.TEXCH ?? ""),
    fundCount: Number(item.FUNDNUM),
    fundHoldingRatio: Number(item.CYBL),
  }));
}

async function fetchStockTrend(stock) {
  const secid = `${stock.market === "1" ? "1" : "0"}.${stock.code}`;
  const url = new URL("https://push2his.eastmoney.com/api/qt/stock/trends2/get");
  url.search = new URLSearchParams({
    secid,
    fields1: "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11",
    fields2: "f51,f52,f53,f54,f55,f56,f57,f58",
    iscr: "0",
    ndays: "1",
  }).toString();
  const response = await fetch(url, {
    headers: {
      Referer: "https://quote.eastmoney.com/",
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!response.ok) throw new Error(`股票分时 HTTP ${response.status}`);
  const payload = await response.json();
  const preClose = Number(payload?.data?.preClose);
  const trends = payload?.data?.trends || [];
  if (!Number.isFinite(preClose) || !trends.length) return null;
  return trends.map((line) => {
    const [time, , close] = line.split(",");
    return {
      time: time.slice(11, 16),
      change: pctChange(Number(close), preClose),
    };
  }).filter((item) => Number.isFinite(item.change));
}

function aggregateTrends(trendSets) {
  const valid = trendSets.filter((set) => Array.isArray(set) && set.length);
  if (!valid.length) return [];
  const length = Math.min(...valid.map((set) => set.length));
  return Array.from({ length }, (_, index) => {
    const bucket = valid.map((set) => set[index]).filter(Boolean);
    return {
      time: bucket[0]?.time || "",
      change: bucket.reduce((sum, item) => sum + item.change, 0) / bucket.length,
    };
  });
}

export async function buildFundTopicDetail(topicCode) {
  const topic = await fetchFundTopicDetail({ INDEXCODE: topicCode, INDEXNAME: topicCode });
  const [funds, stocks] = await Promise.all([fetchTopicFunds(topicCode), fetchTopicStocks(topicCode)]);
  const trendResults = await Promise.allSettled(stocks.slice(0, 5).map(fetchStockTrend));
  const intraday = aggregateTrends(trendResults.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])));
  return {
    topic,
    funds,
    stocks,
    intraday,
    source: "天天基金主题基金 + 东方财富股票分时公开数据",
  };
}
