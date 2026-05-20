import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bell,
  CalendarDays,
  MinusCircle,
  Pencil,
  Plus,
  Gauge,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import "./styles.css";

const fallbackSnapshots = {
  "1D": {
    score: 47,
    label: "中性",
    delta: 2,
    previous: 45,
    week: 41,
    month: 52,
    history: [42, 44, 46, 45, 43, 46, 47],
  },
  "1W": {
    score: 41,
    label: "恐惧",
    delta: -4,
    previous: 44,
    week: 49,
    month: 55,
    history: [51, 49, 45, 43, 40, 42, 41],
  },
  "1M": {
    score: 52,
    label: "中性",
    delta: 7,
    previous: 50,
    week: 48,
    month: 44,
    history: [43, 45, 47, 49, 50, 51, 52],
  },
  "1Y": {
    score: 56,
    label: "中性",
    delta: 11,
    previous: 54,
    week: 50,
    month: 46,
    history: [38, 42, 47, 44, 50, 58, 56],
  },
};

const fallbackSignals = [
  {
    name: "上证综指动量",
    value: "中性",
    score: 51,
    detail: "上证综指在 125 日均线附近运行。",
    icon: TrendingUp,
  },
  {
    name: "A 股价格强度",
    value: "恐惧",
    score: 42,
    detail: "大盘权重表现分化，创阶段新高的个股仍偏少。",
    icon: BarChart3,
  },
  {
    name: "中国市场波动率",
    value: "中性",
    score: 47,
    detail: "已实现波动率有所回落，但仍高于阶段低位。",
    icon: AlertTriangle,
  },
  {
    name: "成交量活跃度",
    value: "中性",
    score: 50,
    detail: "最新成交量接近 20 日均量。",
    icon: Activity,
  },
  {
    name: "阶段区间位置",
    value: "中性",
    score: 52,
    detail: "价格位于近 60 日区间中部。",
    icon: Gauge,
  },
  {
    name: "回撤压力",
    value: "中性",
    score: 50,
    detail: "当前回撤处于可控范围。",
    icon: TrendingDown,
  },
  {
    name: "趋势一致性",
    value: "中性",
    score: 51,
    detail: "短中期趋势方向基本一致。",
    icon: TrendingUp,
  },
];

const rangeOptions = [
  { key: "1D", shortLabel: "日", longLabel: "当日" },
  { key: "1W", shortLabel: "周", longLabel: "本周" },
  { key: "1M", shortLabel: "月", longLabel: "本月" },
  { key: "1Y", shortLabel: "年", longLabel: "本年" },
];
const ranges = rangeOptions.map((item) => item.key);
const candleRanges = [
  { key: "intraday", label: "分时", range: "1d", interval: "5m", note: "当日 5 分钟" },
  { key: "hourly", label: "小时", range: "5d", interval: "60m", note: "近 5 日小时线" },
  { key: "daily", label: "日线", range: "6mo", interval: "1d", note: "近 6 个月日线" },
  { key: "weekly", label: "周线", range: "2y", interval: "1wk", note: "近 2 年周线" },
  { key: "monthly", label: "月线", range: "5y", interval: "1mo", note: "近 5 年月线" },
];

const fallbackCandles = {
  "1D": [
    [3988, 4012, 3970, 4004],
    [4004, 4050, 3995, 4042],
    [4042, 4066, 4018, 4026],
    [4026, 4084, 4020, 4078],
    [4078, 4105, 4060, 4092],
    [4092, 4114, 4076, 4081],
    [4081, 4142, 4078, 4135],
  ].map(([open, high, low, close], index) => ({ open, high, low, close, timestamp: 1778200000 + index * 86400 })),
  "1W": [],
  "1M": [],
  "1Y": [],
};
fallbackCandles["1W"] = fallbackCandles["1D"];
fallbackCandles["1M"] = fallbackCandles["1D"];
fallbackCandles["1Y"] = fallbackCandles["1D"];
fallbackCandles.intraday = fallbackCandles["1D"];
fallbackCandles.hourly = fallbackCandles["1D"];
fallbackCandles.daily = fallbackCandles["1D"];
fallbackCandles.weekly = fallbackCandles["1D"];
fallbackCandles.monthly = fallbackCandles["1D"];

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pctChange(current, previous) {
  if (!previous) return 0;
  return ((current - previous) / previous) * 100;
}

function scoreFromReturn(value, sensitivity = 8) {
  return Math.round(clamp(50 + value * sensitivity));
}

function previousScoreFor(signal) {
  if (!Number.isFinite(signal.previousScore)) return signal.score;
  return signal.previousScore;
}

function scoreForRange(signal, range) {
  return signal.rangeScores?.[range] ?? signal.score;
}

function previousScoreForRange(signal, range) {
  return signal.previousRangeScores?.[range] ?? signal.previousScore ?? scoreForRange(signal, range);
}

function recomputeComposite(signals) {
  if (!signals.length) return { score: 50, previous: 50, delta: 0 };
  const score = Math.round(average(signals.map((signal) => signal.score)));
  const previous = Math.round(average(signals.map(previousScoreFor)));
  return {
    score,
    previous,
    delta: score - previous,
  };
}

function buildRangeSignalScores(points, sensitivity = 7, bias = 0) {
  const latest = points.at(-1);
  const scoreAt = (sourcePoints, offset) => {
    const sourceLatest = sourcePoints.at(-1);
    const previous = sourcePoints.at(-1 - offset) || sourcePoints[0] || sourceLatest;
    return scoreFromReturn(pctChange(sourceLatest.close, previous.close) + bias, sensitivity);
  };
  const previousPoints = points.slice(0, -1);
  return {
    rangeScores: {
      "1D": scoreAt(points, 1),
      "1W": scoreAt(points, 5),
      "1M": scoreAt(points, 22),
      "1Y": scoreAt(points, 252),
    },
    previousRangeScores: previousPoints.length > 2 ? {
      "1D": scoreAt(previousPoints, 1),
      "1W": scoreAt(previousPoints, 5),
      "1M": scoreAt(previousPoints, 22),
      "1Y": scoreAt(previousPoints, 252),
    } : {
      "1D": scoreFromReturn(pctChange(latest.close, points.at(-2)?.close || latest.close), sensitivity),
      "1W": scoreFromReturn(pctChange(latest.close, points.at(-6)?.close || latest.close), sensitivity),
      "1M": scoreFromReturn(pctChange(latest.close, points.at(-23)?.close || latest.close), sensitivity),
      "1Y": scoreFromReturn(pctChange(latest.close, points[0]?.close || latest.close), sensitivity),
    },
  };
}

function labelForScore(score) {
  if (score < 25) return "极度恐惧";
  if (score < 45) return "恐惧";
  if (score < 56) return "中性";
  if (score < 76) return "贪婪";
  return "极度贪婪";
}

function rangeMeta(range) {
  return rangeOptions.find((item) => item.key === range) || rangeOptions[0];
}

function describeDelta(delta) {
  if (delta >= 12) return "情绪快速升温";
  if (delta >= 4) return "情绪持续修复";
  if (delta > -4) return "情绪变化平缓";
  if (delta > -12) return "情绪正在回落";
  return "情绪明显降温";
}

function getRangePoints(points, range) {
  const rangeSize = { "1D": 24, "1W": 40, "1M": 66, "1Y": 180 }[range] || 66;
  return points.slice(-rangeSize);
}

function formatShanghaiClock(date) {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const valueFor = (type) => parts.find((part) => part.type === type)?.value || "";
  return {
    dateLabel: `${valueFor("year")}年${valueFor("month")}月${valueFor("day")}日`,
    timeLabel: `${valueFor("hour")}:${valueFor("minute")}:${valueFor("second")}`,
  };
}

function scoreHistoryFromCloses(points, count = 7) {
  const closes = points.map((point) => point.close).filter(Boolean);
  const step = Math.max(1, Math.floor(closes.length / count));
  return closes
    .filter((_, index) => index % step === 0)
    .slice(-count)
    .map((close, index, sampled) => {
      const previous = sampled[Math.max(0, index - 1)] || close;
      return scoreFromReturn(pctChange(close, previous), 7);
    });
}

function buildSnapshot(points, lookbackDays, previousScore) {
  const slice = points.slice(-lookbackDays);
  const latest = slice.at(-1);
  const first = slice[0] || latest;
  const score = scoreFromReturn(pctChange(latest.close, first.close), 7);
  return {
    score,
    label: labelForScore(score),
    delta: score - previousScore,
    previous: previousScore,
    week: scoreFromReturn(pctChange(latest.close, points.at(-6)?.close || first.close), 7),
    month: scoreFromReturn(pctChange(latest.close, points.at(-22)?.close || first.close), 7),
    history: scoreHistoryFromCloses(slice, 7),
  };
}

function standardDeviation(values) {
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function parseYahooChartPoints(payload) {
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0];
  if (!timestamps.length || !quote?.close?.length) {
    throw new Error("行情响应中没有可用的 OHLC 数据。");
  }

  return timestamps
    .map((timestamp, index) => ({
      timestamp,
      close: quote.close[index],
      open: quote.open[index],
      high: quote.high[index],
      low: quote.low[index],
      volume: quote.volume[index],
    }))
    .filter((point) => (
      Number.isFinite(point.close)
      && Number.isFinite(point.open)
      && Number.isFinite(point.high)
      && Number.isFinite(point.low)
    ));
}

function buildLiveModel(points) {
  const previousPoints = points.slice(0, -1);
  const priorModel = previousPoints.length >= 60 ? buildLiveModel(previousPoints) : null;
  const latest = points.at(-1);
  const previous = points.at(-2) || latest;
  const closes = points.map((point) => point.close);
  const recent = points.slice(-22);
  const recent60 = points.slice(-60);
  const volumes = points.map((point) => point.volume).filter((value) => Number.isFinite(value) && value > 0);
  const recentVolumes = recent.map((point) => point.volume).filter((value) => Number.isFinite(value) && value > 0);
  const ma125 = average(closes.slice(-125));
  const ma50 = average(closes.slice(-50));
  const ma20 = average(closes.slice(-20));
  const return1d = pctChange(latest.close, previous.close);
  const return1w = pctChange(latest.close, points.at(-6)?.close || previous.close);
  const return1m = pctChange(latest.close, points.at(-22)?.close || previous.close);
  const return1y = pctChange(latest.close, points[0]?.close || previous.close);
  const returns20 = recent.slice(1).map((point, index) => pctChange(point.close, recent[index].close));
  const realizedVol = standardDeviation(returns20) * Math.sqrt(252);
  const high60 = Math.max(...recent60.map((point) => point.high).filter(Number.isFinite));
  const low60 = Math.min(...recent60.map((point) => point.low).filter(Number.isFinite));
  const rangePosition = high60 > low60 ? ((latest.close - low60) / (high60 - low60)) * 100 : 50;
  const drawdownFrom60High = high60 ? pctChange(latest.close, high60) : 0;
  const latestVolume = Number.isFinite(latest.volume) ? latest.volume : 0;
  const volumeBase = average(recentVolumes.length ? recentVolumes : volumes.slice(-20));
  const volumeRatio = volumeBase ? latestVolume / volumeBase : 1;

  const momentumScore = Math.round(clamp(50 + pctChange(latest.close, ma125) * 5));
  const strengthScore = Math.round(clamp(50 + pctChange(latest.close, ma50) * 7));
  const volatilityScore = Math.round(clamp(70 - realizedVol * 1.3));
  const volumeScore = Math.round(clamp(50 + (volumeRatio - 1) * 28 + Math.max(return1d, 0) * 5));
  const rangeScore = Math.round(clamp(rangePosition));
  const drawdownScore = Math.round(clamp(100 + drawdownFrom60High * 9));
  const trendConsistencyScore = Math.round(clamp(50 + pctChange(latest.close, ma20) * 5 + pctChange(ma20, ma50) * 8));
  const scores = [momentumScore, strengthScore, volatilityScore, volumeScore, rangeScore, drawdownScore, trendConsistencyScore];
  const aggregateScore = Math.round(average(scores));
  const previousScore = scoreFromReturn(pctChange(previous.close, points.at(-3)?.close || previous.close), 7);
  const momentumRanges = buildRangeSignalScores(points, 7);
  const strengthRanges = buildRangeSignalScores(points, 8, pctChange(latest.close, ma50) * 0.25);
  const volatilityRanges = buildRangeSignalScores(points, 5, (50 - volatilityScore) / 18);
  const volumeRanges = buildRangeSignalScores(points, 6, (volumeRatio - 1) * 0.8);
  const rangePositionRanges = buildRangeSignalScores(points, 5, (rangePosition - 50) / 16);
  const drawdownRanges = buildRangeSignalScores(points, 5, drawdownFrom60High / 4);
  const trendRanges = buildRangeSignalScores(points, 7, pctChange(ma20, ma50) * 0.35);

  const snapshots = {
    "1D": buildSnapshot(points, 2, previousScore),
    "1W": buildSnapshot(points, 6, scoreFromReturn(return1w, 7)),
    "1M": buildSnapshot(points, 22, scoreFromReturn(return1m, 7)),
    "1Y": buildSnapshot(points, points.length, scoreFromReturn(return1y, 7)),
  };

  const liveSignals = [
    {
      name: "上证综指动量",
      value: labelForScore(momentumScore),
      score: momentumScore,
      previousScore: priorModel?.signals.find((signal) => signal.name === "上证综指动量")?.score ?? previousScore,
      ...momentumRanges,
      detail: `最新收盘 ${latest.close.toFixed(2)}，125 日均线 ${ma125.toFixed(2)}。`,
      icon: TrendingUp,
    },
    {
      name: "A 股价格强度",
      value: labelForScore(strengthScore),
      score: strengthScore,
      previousScore: priorModel?.signals.find((signal) => signal.name === "A 股价格强度")?.score ?? previousScore,
      ...strengthRanges,
      detail: `价格相对 50 日均线偏离 ${pctChange(latest.close, ma50).toFixed(2)}%。`,
      icon: BarChart3,
    },
    {
      name: "中国市场波动率",
      value: labelForScore(volatilityScore),
      score: volatilityScore,
      previousScore: priorModel?.signals.find((signal) => signal.name === "中国市场波动率")?.score ?? previousScore,
      ...volatilityRanges,
      detail: `20 日年化已实现波动率约 ${realizedVol.toFixed(1)}%。`,
      icon: AlertTriangle,
    },
    {
      name: "成交量活跃度",
      value: labelForScore(volumeScore),
      score: volumeScore,
      previousScore: priorModel?.signals.find((signal) => signal.name === "成交量活跃度")?.score ?? previousScore,
      ...volumeRanges,
      detail: `最新成交量约为 20 日均量的 ${volumeRatio.toFixed(2)} 倍。`,
      icon: Activity,
    },
    {
      name: "阶段区间位置",
      value: labelForScore(rangeScore),
      score: rangeScore,
      previousScore: priorModel?.signals.find((signal) => signal.name === "阶段区间位置")?.score ?? previousScore,
      ...rangePositionRanges,
      detail: `收盘价位于近 60 日高低区间的 ${rangePosition.toFixed(0)}% 位置。`,
      icon: Gauge,
    },
    {
      name: "回撤压力",
      value: labelForScore(drawdownScore),
      score: drawdownScore,
      previousScore: priorModel?.signals.find((signal) => signal.name === "回撤压力")?.score ?? previousScore,
      ...drawdownRanges,
      detail: `相对近 60 日高点回撤 ${Math.abs(drawdownFrom60High).toFixed(2)}%。`,
      icon: TrendingDown,
    },
    {
      name: "趋势一致性",
      value: labelForScore(trendConsistencyScore),
      score: trendConsistencyScore,
      previousScore: priorModel?.signals.find((signal) => signal.name === "趋势一致性")?.score ?? previousScore,
      ...trendRanges,
      detail: `最新收盘相对 20 日均线 ${pctChange(latest.close, ma20).toFixed(2)}%，20 日均线相对 50 日均线 ${pctChange(ma20, ma50).toFixed(2)}%。`,
      icon: TrendingUp,
    },
  ];

  const composite = recomputeComposite(liveSignals);
  snapshots["1D"].score = composite.score;
  snapshots["1D"].label = labelForScore(composite.score);
  snapshots["1D"].previous = composite.previous;
  snapshots["1D"].delta = composite.delta;

  return {
    snapshots,
    signals: liveSignals,
    candles: {
      "1D": getRangePoints(points, "1D"),
      "1W": getRangePoints(points, "1W"),
      "1M": getRangePoints(points, "1M"),
      "1Y": getRangePoints(points, "1Y"),
      intraday: getRangePoints(points, "1D"),
      hourly: getRangePoints(points, "1W"),
      daily: getRangePoints(points, "1M"),
      weekly: getRangePoints(points, "1Y"),
      monthly: getRangePoints(points, "1Y"),
    },
    meta: {
      close: latest.close,
      date: new Date(latest.timestamp * 1000).toLocaleDateString("zh-CN", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      source: "Yahoo Finance 图表数据：000001.SS",
    },
  };
}

async function fetchShanghaiCompositeModel() {
  const response = await fetchFreshJson("/api/eastmoney/shanghai-composite-daily", "上证综指日线");
  const points = response.candles || [];
  if (points.length < 30) throw new Error("东方财富上证综指日线不足。");
  const model = buildLiveModel(points);
  return {
    ...model,
    meta: {
      ...model.meta,
      source: response.source || "东方财富上证综指日 K 线公开数据",
      refreshedAt: response.refreshedAt,
    },
  };
}

async function fetchYahooShanghaiCompositeModel() {
  const response = await fetch("/api/yahoo/v8/finance/chart/000001.SS?range=1y&interval=1d");
  if (!response.ok) throw new Error(`Quote request failed: ${response.status}`);
  const payload = await response.json();
  const points = parseYahooChartPoints(payload);

  if (points.length < 30) throw new Error("Not enough Shanghai Composite history to calculate sentiment.");
  return buildLiveModel(points);
}

async function fetchCandlesForRange(config) {
  if (config.key === "daily") {
    const payload = await fetchFreshJson("/api/eastmoney/shanghai-composite-daily", "上证综指日线");
    const points = payload.candles || [];
    if (!points.length) throw new Error("东方财富日 K 线响应为空。");
    return points;
  }
  const response = await fetch(`/api/yahoo/v8/finance/chart/000001.SS?range=${config.range}&interval=${config.interval}`);
  if (!response.ok) throw new Error(`K 线请求失败：${response.status}`);
  const payload = await response.json();
  const points = parseYahooChartPoints(payload);
  if (!points.length) throw new Error("K 线响应为空。");
  return points;
}

async function fetchShanghaiCompositeQuote() {
  return fetchFreshJson("/api/eastmoney/shanghai-composite-quote", "上证综指实时行情");
}

const eastmoneyIconMap = {
  em_hs300: BarChart3,
  em_chinext: Activity,
  em_star50: TrendingUp,
  em_zz1000: Gauge,
};

async function fetchEastmoneySignals() {
  const response = await fetch("/api/eastmoney/market-signals");
  if (!response.ok) throw new Error(`东方财富本地接口失败：${response.status}`);
  const payload = await response.json();
  return {
    ...payload,
    signals: (payload.signals || []).map((signal) => ({
      ...signal,
      icon: eastmoneyIconMap[signal.key] || Activity,
    })),
  };
}

function mergeSignalsWithSnapshot(model, extraSignals) {
  if (!extraSignals.length) return model;
  const baseSignals = model.signals.filter((signal) => !extraSignals.some((extra) => extra.name === signal.name));
  const signals = [...baseSignals, ...extraSignals];
  const composite = recomputeComposite(signals);
  return {
    ...model,
    signals,
    snapshots: {
      ...model.snapshots,
      "1D": {
        ...model.snapshots["1D"],
        score: composite.score,
        previous: composite.previous,
        label: labelForScore(composite.score),
        delta: composite.delta,
      },
    },
  };
}

function toneForScore(score) {
  if (score < 25) return "extreme-fear";
  if (score < 45) return "fear";
  if (score < 56) return "neutral";
  if (score < 76) return "greed";
  return "extreme-greed";
}

function GaugeDial({ score, label }) {
  const clamped = Math.max(0, Math.min(score, 100));
  const needle = -118 + clamped * 2.36;
  return (
    <div className="gauge-wrap" aria-label={`恐惧与贪婪分数 ${score}`}>
      <div className="gauge-scale">
        <span>0</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100</span>
      </div>
      <div className="gauge-arc" />
      <div className="gauge-needle" style={{ transform: `rotate(${needle}deg)` }} />
      <div className="gauge-hub" />
      <div className="gauge-value">
        <strong>{score}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function TrendChart({ values }) {
  const points = useMemo(() => {
    return values
      .map((value, index) => {
        const x = 58 + index * (420 / (values.length - 1));
        const y = 138 - value * 1.08;
        return `${x},${y}`;
      })
      .join(" ");
  }, [values]);

  return (
    <svg className="trend-chart" viewBox="0 0 510 150" role="img" aria-label="情绪历史走势">
      <defs>
        <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#d94835" stopOpacity="0.22" />
          <stop offset="1" stopColor="#d94835" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[25, 50, 75, 100].map((tick) => (
        <g key={tick}>
          <line x1="48" x2="492" y1={138 - tick * 1.08} y2={138 - tick * 1.08} />
          <text x="8" y={142 - tick * 1.08}>{tick}</text>
        </g>
      ))}
      <polygon points={`58,138 ${points} 478,138`} fill="url(#trendFill)" />
      <polyline points={points} fill="none" stroke="#d94835" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {values.map((value, index) => {
        const x = 58 + index * (420 / (values.length - 1));
        const y = 138 - value * 1.08;
        return <circle key={`${value}-${index}`} cx={x} cy={y} r="5" />;
      })}
    </svg>
  );
}

function MiniSentimentBand({ score, label }) {
  const safeScore = clamp(Number.isFinite(score) ? score : 50);
  return (
    <div className="mini-sentiment-band" aria-label="情绪区间定位">
      <div className="mini-band-track">
        <span className="mini-band-marker" style={{ left: `${safeScore}%` }} />
      </div>
      <div className="mini-band-labels">
        <span>恐慌</span>
        <span>中性</span>
        <span>贪婪</span>
      </div>
      <div className="mini-band-caption">
        <strong>{safeScore}</strong>
        <small>{label}</small>
      </div>
    </div>
  );
}

function movingAverage(candles, size) {
  return candles.map((item, index) => {
    if (index + 1 < size) return null;
    const window = candles.slice(index + 1 - size, index + 1);
    return {
      timestamp: item.timestamp,
      value: average(window.map((point) => point.close)),
    };
  });
}

function linePathFor(points, step, scaleY) {
  return points
    .map((point, index) => {
      if (!point || !Number.isFinite(point.value)) return null;
      const x = 82 + index * step + step / 2;
      return `${x},${scaleY(point.value)}`;
    })
    .filter(Boolean)
    .join(" ");
}

function CandlestickChart({ candles, periodNote }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const visible = candles.filter((item) => item && Number.isFinite(item.open) && Number.isFinite(item.high) && Number.isFinite(item.low) && Number.isFinite(item.close)).slice(-42);
  const safeCandles = visible.length ? visible : fallbackCandles["1D"];
  const ma5 = movingAverage(safeCandles, 5);
  const ma10 = movingAverage(safeCandles, 10);
  const ma20 = movingAverage(safeCandles, 20);
  const maValues = [...ma5, ...ma10, ...ma20]
    .map((item) => item?.value)
    .filter(Number.isFinite);
  const highs = [...safeCandles.map((item) => item.high), ...maValues];
  const lows = [...safeCandles.map((item) => item.low), ...maValues];
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const pad = Math.max(1, (max - min) * 0.12);
  const top = max + pad;
  const bottom = min - pad;
  const scaleY = (value) => 34 + ((top - value) / (top - bottom)) * 180;
  const step = 760 / safeCandles.length;
  const bodyWidth = Math.max(5, Math.min(13, step * 0.52));
  const gridValues = [top, top - (top - bottom) / 3, top - ((top - bottom) * 2) / 3, bottom];
  const hoveredCandle = hoveredIndex == null ? null : safeCandles[hoveredIndex];
  const hoveredDate = hoveredCandle
    ? new Date(hoveredCandle.timestamp * 1000).toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
    : null;
  const hoveredChange = hoveredCandle && Number.isFinite(hoveredCandle.open) && hoveredCandle.open !== 0
    ? ((hoveredCandle.close - hoveredCandle.open) / hoveredCandle.open) * 100
    : null;

  return (
    <div className="candle-chart-wrap">
      {hoveredCandle && (
        <aside className="candle-hover-card" aria-live="polite">
          <strong>{hoveredDate}</strong>
          <div className="candle-hover-grid">
            <span>开盘</span>
            <b>{hoveredCandle.open.toFixed(2)}</b>
            <span>最高</span>
            <b>{hoveredCandle.high.toFixed(2)}</b>
            <span>最低</span>
            <b>{hoveredCandle.low.toFixed(2)}</b>
            <span>收盘</span>
            <b>{hoveredCandle.close.toFixed(2)}</b>
            <span>涨跌</span>
            <b className={hoveredChange != null && hoveredChange >= 0 ? "up" : "down"}>
              {hoveredChange == null ? "--" : formatPercent(hoveredChange)}
            </b>
          </div>
        </aside>
      )}
      <svg className="candle-chart" viewBox="0 0 860 250" role="img" aria-label="上证综指 K 线图，含 MA5、MA10、MA20 均线">
        {gridValues.map((value) => (
          <g key={value}>
            <line x1="72" x2="836" y1={scaleY(value)} y2={scaleY(value)} />
            <text x="10" y={scaleY(value) + 4}>{value.toFixed(0)}</text>
          </g>
        ))}
        <polyline className="ma-line ma5" points={linePathFor(ma5, step, scaleY)} fill="none" />
        <polyline className="ma-line ma10" points={linePathFor(ma10, step, scaleY)} fill="none" />
        <polyline className="ma-line ma20" points={linePathFor(ma20, step, scaleY)} fill="none" />
        {safeCandles.map((item, index) => {
          const x = 82 + index * step + step / 2;
          const openY = scaleY(item.open);
          const closeY = scaleY(item.close);
          const highY = scaleY(item.high);
          const lowY = scaleY(item.low);
          const up = item.close >= item.open;
          const bodyY = Math.min(openY, closeY);
          const bodyHeight = Math.max(3, Math.abs(closeY - openY));
          return (
            <g key={`${item.timestamp}-${index}`} className={up ? "candle-up" : "candle-down"}>
              <line className="wick" x1={x} x2={x} y1={highY} y2={lowY} />
              <rect className="candle-body" x={x - bodyWidth / 2} y={bodyY} width={bodyWidth} height={bodyHeight} rx="2" />
              <rect
                className="candle-hitbox"
                x={x - step / 2}
                y={16}
                width={step}
                height={208}
                fill="transparent"
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex((current) => (current === index ? null : current))}
              />
            </g>
          );
        })}
        <text className="axis-note" x="72" y="238">{periodNote} · {safeCandles.length} 根 K 线</text>
      </svg>
      <div className="ma-legend" aria-label="均线说明">
        <span><i className="ma5" />MA5</span>
        <span><i className="ma10" />MA10</span>
        <span><i className="ma20" />MA20</span>
      </div>
    </div>
  );
}

async function fetchFundCategories() {
  return fetchFreshJson("/api/eastmoney/fund-categories", "fund categories");
}

async function fetchFundTopics(forceRefresh = false) {
  return fetchFreshJson(`/api/eastmoney/fund-topics${forceRefresh ? "?refresh=1" : ""}`, "fund topics");
}

async function fetchFundMarketRankings() {
  return fetchFreshJson("/api/eastmoney/fund-market-rankings", "fund market rankings");
}

async function fetchFundSearch(keyword) {
  return fetchFreshJson(`/api/eastmoney/fund-search?keyword=${encodeURIComponent(keyword)}`, "fund search");
}

async function fetchFreshJson(url, label) {
  const withTimestamp = `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(withTimestamp, { cache: "no-store" });
      if (!response.ok) throw new Error(`${label}请求失败：${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`${label}加载失败`);
}

async function fetchFundTopicDetail(code) {
  return fetchFreshJson(`/api/eastmoney/fund-topic-detail?code=${encodeURIComponent(code)}`, "主题详情");
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

async function fetchFundDetail(code) {
  return fetchFreshJson(`/api/eastmoney/fund-detail?code=${encodeURIComponent(code)}`, "基金详情");
}

function formatNav(value) {
  if (!Number.isFinite(value)) return "--";
  return value.toFixed(4);
}

function formatRatio(value) {
  if (!Number.isFinite(value)) return "--";
  return `${value.toFixed(2)}%`;
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return "--";
  return value.toFixed(2);
}

function FundCategoryPanel({ categories, state, onOpenFull }) {
  const [fundRange, setFundRange] = useState("month");
  const fundRangeMeta = {
    day: { label: "日", valueKey: "dayAvg", helperKey: "weekAvg", helperLabel: "近 1 周" },
    week: { label: "周", valueKey: "weekAvg", helperKey: "monthAvg", helperLabel: "近 1 月" },
    month: { label: "月", valueKey: "monthAvg", helperKey: "quarterAvg", helperLabel: "近 3 月" },
    year: { label: "年", valueKey: "yearAvg", helperKey: "quarterAvg", helperLabel: "近 3 月" },
  }[fundRange];
  const sorted = [...categories].sort((a, b) => (b[fundRangeMeta.valueKey] || 0) - (a[fundRangeMeta.valueKey] || 0));
  const maxAbs = Math.max(1, ...sorted.map((item) => Math.abs(item[fundRangeMeta.valueKey] || 0)));
  return (
    <section id="funds" className="fund-section">
      <div className="section-heading">
        <div className="section-heading-main">
          <h2>基金分类涨幅</h2>
          <div className="inline-range-tabs" aria-label="基金分类涨幅区间">
            {[
              { key: "day", label: "日" },
              { key: "week", label: "周" },
              { key: "month", label: "月" },
              { key: "year", label: "年" },
            ].map((item) => (
              <button
                key={item.key}
                className={fundRange === item.key ? "active" : ""}
                onClick={() => setFundRange(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="section-actions">
          <span>{state === "live" ? "东方财富 / 天天基金公开排行样本" : "正在加载公开数据"}</span>
          <button onClick={onOpenFull}>进入基金榜单</button>
        </div>
      </div>
      <div className="fund-grid">
        {sorted.map((item) => {
          const primaryValue = item[fundRangeMeta.valueKey];
          const helperValue = item[fundRangeMeta.helperKey];
          const tone = primaryValue >= 0 ? "up" : "down";
          const width = `${Math.max(8, (Math.abs(primaryValue) / maxAbs) * 100)}%`;
          return (
            <article className="fund-card" key={item.key}>
              <div className="fund-card-top">
                <strong>{item.label}</strong>
                <span className={tone}>{formatPercent(primaryValue)}</span>
              </div>
              <div className="fund-bar" aria-hidden="true">
                <i className={tone} style={{ width }} />
              </div>
              <div className="fund-metrics">
                <span>日均 {formatPercent(item.dayAvg)}</span>
                <span>{fundRangeMeta.helperLabel} {formatPercent(helperValue)}</span>
              </div>
              <p>{item.topFunds?.[0]?.name || "公开排行样本"} · 前 30 只同类基金样本，按近 {fundRangeMeta.label}维度排序</p>
            </article>
          );
        })}
        {!sorted.length && (
          <article className="fund-card empty">
            <strong>暂无可用基金分类数据</strong>
            <p>公开接口没有返回可计算样本时，这里不会展示替代假数据。</p>
          </article>
        )}
      </div>
    </section>
  );
}

const portfolioStorageKey = "kirsi-fund-portfolios-v1";

function createPortfolio(name = "1.0") {
  return {
    id: `portfolio-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    holdings: [],
  };
}

function loadPortfolios() {
  if (typeof window === "undefined") return [createPortfolio()];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(portfolioStorageKey) || "[]");
    if (Array.isArray(parsed) && parsed.length) {
      return parsed.map((item, index) => ({
        id: item.id || `portfolio-${index}`,
        name: item.name || `${index + 1}.0`,
        holdings: Array.isArray(item.holdings) ? item.holdings : [],
      }));
    }
  } catch {
    // Ignore broken local data and rebuild the default portfolio.
  }
  return [createPortfolio()];
}

function savePortfolios(portfolios) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(portfolioStorageKey, JSON.stringify(portfolios));
}

function parseInputNumber(value) {
  const normalized = String(value || "").replace(/,/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value) {
  if (!Number.isFinite(value)) return "--";
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function FundPortfolioTracker({ onOpenFund }) {
  const [portfolios, setPortfolios] = useState(() => loadPortfolios());
  const [activePortfolioId, setActivePortfolioId] = useState(() => portfolios[0]?.id || "");
  const [fundQuery, setFundQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchState, setSearchState] = useState("idle");
  const [selectedFund, setSelectedFund] = useState(null);
  const [purchaseDate, setPurchaseDate] = useState("");
  const [holdingAmount, setHoldingAmount] = useState("");
  const [holdingProfit, setHoldingProfit] = useState("");
  const activePortfolio = portfolios.find((item) => item.id === activePortfolioId) || portfolios[0];
  const totalAmount = activePortfolio?.holdings.reduce((sum, item) => sum + parseInputNumber(item.amount), 0) || 0;
  const totalProfit = activePortfolio?.holdings.reduce((sum, item) => sum + parseInputNumber(item.profit), 0) || 0;
  const profitRatio = totalAmount ? (totalProfit / totalAmount) * 100 : 0;

  useEffect(() => {
    savePortfolios(portfolios);
  }, [portfolios]);

  useEffect(() => {
    if (!portfolios.some((item) => item.id === activePortfolioId)) {
      setActivePortfolioId(portfolios[0]?.id || "");
    }
  }, [activePortfolioId, portfolios]);

  useEffect(() => {
    const query = fundQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchState("idle");
      return undefined;
    }

    let cancelled = false;
    setSearchState("loading");
    const timer = window.setTimeout(() => {
      fetchFundSearch(query)
        .then((payload) => {
          if (cancelled) return;
          setSearchResults(payload.funds || []);
          setSearchState(payload.funds?.length ? "live" : "empty");
        })
        .catch((error) => {
          if (cancelled) return;
          console.warn(error);
          setSearchResults([]);
          setSearchState("error");
        });
    }, 260);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fundQuery]);

  const updatePortfolios = (updater) => {
    setPortfolios((current) => {
      const next = updater(current);
      return next.length ? next : [createPortfolio()];
    });
  };

  const addPortfolio = () => {
    const nextName = `${portfolios.length + 1}.0`;
    const nextPortfolio = createPortfolio(nextName);
    setPortfolios((current) => [...current, nextPortfolio]);
    setActivePortfolioId(nextPortfolio.id);
  };

  const renamePortfolio = () => {
    if (!activePortfolio) return;
    const nextName = window.prompt("组合名称", activePortfolio.name);
    if (!nextName?.trim()) return;
    updatePortfolios((current) => current.map((item) => (
      item.id === activePortfolio.id ? { ...item, name: nextName.trim() } : item
    )));
  };

  const clearPortfolio = () => {
    if (!activePortfolio) return;
    const confirmed = window.confirm(`清空组合「${activePortfolio.name}」里的基金？`);
    if (!confirmed) return;
    updatePortfolios((current) => current.map((item) => (
      item.id === activePortfolio.id ? { ...item, holdings: [] } : item
    )));
  };

  const movePortfolio = (direction) => {
    const index = portfolios.findIndex((item) => item.id === activePortfolioId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= portfolios.length) return;
    updatePortfolios((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removePortfolio = () => {
    if (!activePortfolio || portfolios.length <= 1) return;
    const confirmed = window.confirm(`删除组合「${activePortfolio.name}」？`);
    if (!confirmed) return;
    updatePortfolios((current) => current.filter((item) => item.id !== activePortfolio.id));
  };

  const addHolding = () => {
    const fund = selectedFund || searchResults[0];
    if (!fund?.code) return;
    const holding = {
      id: `holding-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      code: fund.code,
      name: fund.shortName || fund.name,
      purchaseDate,
      amount: parseInputNumber(holdingAmount),
      profit: parseInputNumber(holdingProfit),
    };
    updatePortfolios((current) => current.map((item) => (
      item.id === activePortfolio.id
        ? { ...item, holdings: [holding, ...item.holdings] }
        : item
    )));
    setFundQuery("");
    setSearchResults([]);
    setSelectedFund(null);
    setPurchaseDate("");
    setHoldingAmount("");
    setHoldingProfit("");
  };

  const removeHolding = (holdingId) => {
    updatePortfolios((current) => current.map((item) => (
      item.id === activePortfolio.id
        ? { ...item, holdings: item.holdings.filter((holding) => holding.id !== holdingId) }
        : item
    )));
  };

  return (
    <section className="portfolio-panel">
      <div className="portfolio-head">
        <div>
          <span>自选组合</span>
          <h2>基金持仓跟踪</h2>
          <p>选择组合后录入基金、购买时间、持有金额和持有收益，方便盯住自己在意的基金。</p>
        </div>
        <div className="portfolio-actions">
          <select value={activePortfolio?.id || ""} onChange={(event) => setActivePortfolioId(event.target.value)}>
            {portfolios.map((portfolio) => (
              <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>
            ))}
          </select>
          <button type="button" onClick={addPortfolio} aria-label="新建组合"><Plus size={16} /></button>
          <button type="button" onClick={renamePortfolio} aria-label="修改组合名称"><Pencil size={16} /></button>
          <button type="button" onClick={clearPortfolio} aria-label="清空组合"><Trash2 size={16} /></button>
          <button type="button" onClick={() => movePortfolio(-1)} aria-label="上移组合"><ArrowUp size={16} /></button>
          <button type="button" onClick={() => movePortfolio(1)} aria-label="下移组合"><ArrowDown size={16} /></button>
          <button type="button" onClick={removePortfolio} disabled={portfolios.length <= 1} aria-label="删除组合"><MinusCircle size={16} /></button>
        </div>
      </div>

      <div className="portfolio-summary">
        <div><span>持有基金</span><strong>{activePortfolio?.holdings.length || 0}</strong></div>
        <div><span>持有金额</span><strong>{formatMoney(totalAmount)}</strong></div>
        <div><span>持有收益</span><strong className={totalProfit >= 0 ? "up" : "down"}>{formatMoney(totalProfit)}</strong></div>
        <div><span>收益率</span><strong className={profitRatio >= 0 ? "up" : "down"}>{formatPercent(profitRatio)}</strong></div>
      </div>

      <div className="portfolio-form">
        <div className="portfolio-search-field">
          <label>基金名称/编号</label>
          <input
            value={selectedFund ? `${selectedFund.code} ${selectedFund.shortName || selectedFund.name}` : fundQuery}
            onChange={(event) => {
              setSelectedFund(null);
              setFundQuery(event.target.value);
            }}
            placeholder="输入基金名称或代码"
          />
          {(searchResults.length > 0 || searchState === "empty" || searchState === "loading") && !selectedFund && (
            <div className="portfolio-search-results">
              {searchState === "loading" && <span>搜索中...</span>}
              {searchState === "empty" && <span>没有找到匹配基金</span>}
              {searchResults.map((fund) => (
                <button
                  type="button"
                  key={fund.code}
                  onClick={() => {
                    setSelectedFund(fund);
                    setFundQuery("");
                  }}
                >
                  <strong>{fund.shortName || fund.name}</strong>
                  <small>{fund.code} {fund.type}</small>
                </button>
              ))}
            </div>
          )}
        </div>
        <label>
          <span>购买时间</span>
          <input type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} />
        </label>
        <label>
          <span>持有金额</span>
          <input inputMode="decimal" value={holdingAmount} onChange={(event) => setHoldingAmount(event.target.value)} placeholder="例如 10000" />
        </label>
        <label>
          <span>持有收益</span>
          <input inputMode="decimal" value={holdingProfit} onChange={(event) => setHoldingProfit(event.target.value)} placeholder="例如 320 或 -80" />
        </label>
        <button type="button" className="portfolio-add-button" onClick={addHolding} disabled={!selectedFund && !searchResults[0]}>
          加入组合
        </button>
      </div>

      <div className="portfolio-holdings">
        <div className="portfolio-holdings-head">
          <span>基金</span>
          <span>购买时间</span>
          <span>持有金额</span>
          <span>持有收益</span>
          <span>操作</span>
        </div>
        {activePortfolio?.holdings.length ? activePortfolio.holdings.map((holding) => (
          <button
            type="button"
            className="portfolio-holding-row"
            key={holding.id}
            onClick={() => onOpenFund?.(holding)}
          >
            <div>
              <strong>{holding.name}</strong>
              <small>{holding.code}</small>
            </div>
            <span>{holding.purchaseDate || "--"}</span>
            <b>{formatMoney(holding.amount)}</b>
            <em className={holding.profit >= 0 ? "up" : "down"}>{formatMoney(holding.profit)}</em>
            <div className="portfolio-row-actions">
              <button type="button" onClick={(event) => {
                event.stopPropagation();
                onOpenFund?.(holding);
              }}>查看</button>
              <button type="button" onClick={(event) => {
                event.stopPropagation();
                removeHolding(holding.id);
              }}>移除</button>
            </div>
          </button>
        )) : (
          <div className="portfolio-empty">这个组合还没有基金，先从上面搜索添加一只。</div>
        )}
      </div>
    </section>
  );
}

function FundOnlyPage({ topics, state, refreshedAt, marketRankings, marketRankingState, onBack }) {
  const [rankMode, setRankMode] = useState("change");
  const [selectedTopicCode, setSelectedTopicCode] = useState(null);
  const [followTopTopic, setFollowTopTopic] = useState(true);
  const [topicDetail, setTopicDetail] = useState(null);
  const [topicDetailState, setTopicDetailState] = useState("idle");
  const [selectedFund, setSelectedFund] = useState(null);
  const [selectedRankingFund, setSelectedRankingFund] = useState(null);
  const [fundDetail, setFundDetail] = useState(null);
  const [fundDetailState, setFundDetailState] = useState("idle");
  const pageTopRef = useRef(null);
  const detailPanelRef = useRef(null);
  const lastTopicRefreshRef = useRef(null);
  const sorted = [...topics].sort((a, b) => (
    rankMode === "hot" ? (b.strength || 0) - (a.strength || 0) : (b.dayChange || 0) - (a.dayChange || 0)
  ));
  const updated = topicDetail?.refreshedAt || refreshedAt || "\u6570\u636E\u52A0\u8F7D\u4E2D";
  const activeTopic = topicDetail?.topic || sorted.find((item) => item.code === selectedTopicCode) || sorted[0];
  const selectFundInline = (fund) => {
    if (!fund?.code) return;
    setSelectedFund(fund);
    setFundDetail(null);
    setFundDetailState("loading");
    const normalizedName = (fund.name || fund.shortName || "").replace(/\s/g, "");
    const matchedTopic = sorted.find((topic) => {
      const topicName = (topic.name || "").replace(/\s/g, "");
      return topicName && normalizedName.includes(topicName);
    });
    if (matchedTopic?.code && matchedTopic.code !== selectedTopicCode) {
      setFollowTopTopic(false);
      setSelectedTopicCode(matchedTopic.code);
    }
    window.requestAnimationFrame(() => {
      const targetTop = detailPanelRef.current
        ? detailPanelRef.current.getBoundingClientRect().top + window.scrollY - 18
        : 0;
      window.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    });
  };

  useEffect(() => {
    if (!selectedTopicCode && sorted[0]?.code) {
      setSelectedTopicCode(sorted[0].code);
    }
  }, [selectedTopicCode, sorted]);

  useEffect(() => {
    if (!sorted.length) return;
    if (refreshedAt && refreshedAt !== lastTopicRefreshRef.current && selectedTopicCode !== sorted[0]?.code) {
      lastTopicRefreshRef.current = refreshedAt;
      setFollowTopTopic(true);
      setSelectedTopicCode(sorted[0]?.code || null);
      return;
    }
    if (refreshedAt && refreshedAt !== lastTopicRefreshRef.current) {
      lastTopicRefreshRef.current = refreshedAt;
    }
    if (followTopTopic) {
      if (selectedTopicCode !== sorted[0]?.code) {
        setSelectedTopicCode(sorted[0]?.code || null);
      }
      return;
    }
    if (selectedTopicCode && sorted.some((item) => item.code === selectedTopicCode)) {
      return;
    }
    setSelectedTopicCode(sorted[0]?.code || null);
  }, [followTopTopic, refreshedAt, selectedTopicCode, sorted]);

  useEffect(() => {
    if (!selectedTopicCode) return undefined;
    let cancelled = false;
    const loadTopicDetail = (initial = false) => {
      if (initial) setTopicDetailState("loading");
      fetchFundTopicDetail(selectedTopicCode)
        .then((detail) => {
          if (cancelled) return;
          setTopicDetail(detail);
          setTopicDetailState("live");
        })
        .catch((error) => {
          if (cancelled) return;
          console.warn(error);
          setTopicDetail(null);
          setTopicDetailState("error");
        });
    };
    loadTopicDetail(true);
    const timer = window.setInterval(() => loadTopicDetail(false), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedTopicCode]);

  useEffect(() => {
    if (!selectedFund?.code) return undefined;
    let cancelled = false;
    const loadFundDetail = (initial = false) => {
      if (initial) setFundDetailState("loading");
      fetchFundDetail(selectedFund.code)
        .then((detail) => {
          if (cancelled) return;
          setFundDetail(detail);
          setFundDetailState("live");
        })
        .catch((error) => {
          if (cancelled) return;
          console.warn(error);
          setFundDetail(null);
          setFundDetailState("error");
        });
    };
    loadFundDetail(true);
    const timer = window.setInterval(() => loadFundDetail(false), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedFund]);

  return (
    <section className="fund-only-page" ref={pageTopRef}>
      <div className="fund-only-top">
        <strong>基金主题</strong>
        <span>东方财富公开主题数据</span>
      </div>
      <div className="fund-only-title">
        <div>
          <h1>基金主题细分榜</h1>
          <p>更新于 {updated}，精选主题展示，底层仍使用东方财富公开主题数据。</p>
          <FundRankingPreview
            rankings={marketRankings}
            state={marketRankingState}
            selectedFund={selectedRankingFund}
          />
        </div>
        <div className="fund-title-aside">
          <StrengthExplainer topic={activeTopic} />
          <MarketFundRankingCard
            rankings={marketRankings}
            state={marketRankingState}
            selectedFundCode={selectedRankingFund?.code}
            onSelectFund={setSelectedRankingFund}
          />
        </div>
      </div>
      <div className="fund-rank-tabs" aria-label="基金榜单排序">
        <button className={rankMode === "change" ? "active" : ""} onClick={() => {
          setRankMode("change");
          setFollowTopTopic(true);
        }}>{"\u6DA8\u5E45\u699C"}</button>
        <button className={rankMode === "hot" ? "active" : ""} onClick={() => {
          setRankMode("hot");
          setFollowTopTopic(true);
        }}>{"\u4E3B\u9898\u5F3A\u5EA6"}</button>
      </div>
      <FundPortfolioTracker
        onOpenFund={selectFundInline}
      />
      <div ref={detailPanelRef}>
        {selectedFund ? (
          <SelectedFundPanel
            fund={selectedFund}
            detail={fundDetail}
            state={fundDetailState}
            topicDetail={topicDetail}
            onClear={() => setSelectedFund(null)}
            onOpenFund={selectFundInline}
          />
        ) : (
          <TopicDetailPanel
            detail={topicDetail}
            state={topicDetailState}
            onOpenFund={selectFundInline}
          />
        )}
      </div>
      <div className="fund-rank-card">
        <div className="fund-rank-head">
          <span>排名</span>
          <span>主题名称</span>
          <span>当日涨跌</span>
          <span>主题强度</span>
          <span>近 1 月</span>
        </div>
        {sorted.length > 0 && sorted.map((item, index) => (
          <button
            type="button"
            className={`fund-rank-row ${selectedTopicCode === item.code ? "selected" : ""}`}
            key={item.code}
            onClick={() => {
              setFollowTopTopic(false);
              setSelectedTopicCode(item.code);
              const targetTop = pageTopRef.current
                ? pageTopRef.current.getBoundingClientRect().top + window.scrollY - 16
                : 0;
              window.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
            }}
          >
            <span className={index < 3 ? "hot-rank" : ""}>{String(index + 1).padStart(2, "0")}</span>
            <strong>
              {item.name}
              {item.sourceName && item.sourceName !== item.name ? (
                <small>映射自 {item.sourceName}{item.childCount > 1 ? ` 等 ${item.childCount} 个主题` : ""}</small>
              ) : item.childCount > 1 ? (
                <small>合并 {item.childCount} 个相关主题</small>
              ) : null}
            </strong>
            <em className={(item.dayChange || 0) >= 0 ? "up" : "down"}>{formatPercent(item.dayChange)}</em>
            <b>{Number.isFinite(item.strength) ? item.strength.toFixed(1) : "--"}</b>
            <span>{formatPercent(item.month)}</span>
          </button>
        ))}
        {!sorted.length && (
          <div className="fund-rank-empty">基金主题公开数据正在加载，暂无可展示榜单。</div>
        )}
      </div>
    </section>
  );
}

function StrengthExplainer({ topic }) {
  const strength = Number.isFinite(topic?.strength) ? topic.strength : 0;
  return (
    <aside className="strength-explainer">
      <div className="strength-ring" style={{ "--strength": `${strength}%` }}>
        <strong>{strength ? strength.toFixed(1) : "--"}</strong>
      </div>
      <div>
        <span>主题强度</span>
        <p>按近 1 月排名百分位为主，并加入当日涨幅微调；越接近 100，代表该主题在公开主题池里越靠前。</p>
      </div>
    </aside>
  );
}

function TopicHeroSummary({ topics, activeTopic }) {
  const topTopic = activeTopic || topics[0];
  const topMovers = topics.slice(0, 3);
  const maxMove = Math.max(1, ...topMovers.map((item) => Math.abs(item.dayChange || 0)));
  if (!topTopic) {
    return (
      <div className="topic-hero-summary empty">
        <span>主题雷达</span>
        <strong>等待公开数据</strong>
      </div>
    );
  }

  return (
    <div className="topic-hero-summary">
      <div className="topic-hero-main">
        <span>当前榜首主题</span>
        <div>
          <strong>{topTopic.name}</strong>
          <em className={(topTopic.dayChange || 0) >= 0 ? "up" : "down"}>{formatPercent(topTopic.dayChange)}</em>
        </div>
      </div>
      <div className="topic-hero-metrics">
        <span>主题强度 <b>{Number.isFinite(topTopic.strength) ? topTopic.strength.toFixed(1) : "--"}</b></span>
        <span>近 1 月 <b>{formatPercent(topTopic.month)}</b></span>
        <span>近 3 月 <b>{formatPercent(topTopic.quarter)}</b></span>
      </div>
      <div className="topic-hero-bars" aria-label="涨幅前三主题">
        {topMovers.map((item, index) => {
          const width = `${Math.max(10, (Math.abs(item.dayChange || 0) / maxMove) * 100)}%`;
          const tone = (item.dayChange || 0) >= 0 ? "up" : "down";
          return (
            <div className="topic-hero-bar-row" key={item.code}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{item.name}</strong>
              <div className="topic-hero-bar"><i className={tone} style={{ width }} /></div>
              <em className={tone}>{formatPercent(item.dayChange)}</em>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FundRankingPreview({ rankings, state, selectedFund }) {
  const rows = (rankings?.gainers || []).slice(0, 10);
  const rowSignature = rows.map((item) => `${item.code}:${item.dayChange}`).join("|");
  const leadFund = rows[0] || null;
  const [previewFund, setPreviewFund] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailState, setDetailState] = useState("idle");

  useEffect(() => {
    if (!rows.length) {
      setPreviewFund(null);
      setDetail(null);
      setDetailState(state === "live" ? "empty" : "loading");
      return undefined;
    }
    let cancelled = false;
    const loadLeadFund = async (initial = false) => {
      if (initial) setDetailState("loading");
      try {
        if (selectedFund?.code) {
          const payload = await fetchFundDetail(selectedFund.code);
          if (cancelled) return;
          setPreviewFund(selectedFund);
          setDetail(payload);
          setDetailState("live");
          return;
        }
        let fallback = null;
        for (const fund of rows) {
          const payload = await fetchFundDetail(fund.code);
          if (cancelled) return;
          if (!fallback) fallback = { fund, payload };
          if ((payload.intraday || []).length) {
            setPreviewFund(fund);
            setDetail(payload);
            setDetailState("live");
            return;
          }
        }
        if (fallback) {
          setPreviewFund(fallback.fund);
          setDetail(fallback.payload);
          setDetailState("live");
        } else {
          setPreviewFund(rows[0] || null);
          setDetail(null);
          setDetailState("empty");
        }
      } catch (error) {
        if (cancelled) return;
        console.warn(error);
        setPreviewFund(rows[0] || null);
        setDetail(null);
        setDetailState("error");
      }
    };
    loadLeadFund(true);
    const timer = window.setInterval(() => loadLeadFund(false), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [rowSignature, selectedFund?.code, state]);

  if (!leadFund) {
    return (
      <div className="fund-ranking-preview empty">
        <span>基金排行走势</span>
        <strong>{state === "live" ? "暂无可展示基金" : "正在加载公开排行"}</strong>
      </div>
    );
  }

  const chartPoints = (detail?.intraday || []).map((item) => ({ ...item, value: item.change }));
  const displayFund = previewFund || leadFund;
  const displayChange = Number.isFinite(detail?.estimate?.change)
    ? detail.estimate.change
    : displayFund.dayChange;

  return (
    <div className="fund-ranking-preview">
      <div className="fund-ranking-preview-head">
        <div>
          <span>{displayFund.code === leadFund.code ? "全市场涨幅榜首走势" : "涨幅前十走势预览"}</span>
          <strong>{detail?.name || displayFund.name}</strong>
        </div>
        <em className={(displayChange || 0) >= 0 ? "up" : "down"}>{formatPercent(displayChange)}</em>
      </div>
      <div className="fund-ranking-preview-chart">
        {detailState === "live" && chartPoints.length ? (
          <FundLineChart
            points={chartPoints}
            positive={(displayChange || 0) >= 0}
            percent
            labelMode="time"
          />
        ) : (
          <div className="intraday-empty">
            {detailState === "error" ? "走势暂时不可用" : "正在加载基金实时走势..."}
          </div>
        )}
      </div>
    </div>
  );
}

function MarketFundRankingCard({ rankings, state, selectedFundCode, onSelectFund }) {
  const [mode, setMode] = useState("gainers");
  const tabs = [
    { key: "gainers", label: "涨幅前十", metric: "日涨幅" },
    { key: "losers", label: "跌幅前十", metric: "日跌幅" },
    { key: "purchases", label: "购买前十", metric: "真实购买量" },
    { key: "sales", label: "售出前十", metric: "真实售出量" },
  ];
  const activeTab = tabs.find((item) => item.key === mode) || tabs[0];
  const rows = [...(rankings?.[mode] || [])].slice(0, 10);
  const unavailableText = rankings?.unavailable?.[mode];
  const dataDate = rows.find((item) => item.navDate)?.navDate || rankings?.dataDate || rankings?.refreshedAt || "--";

  return (
    <aside className="top-fund-mover-card">
      <div className="top-fund-mover-head">
        <span>全市场基金排行</span>
        <small>{activeTab.metric}</small>
      </div>
      <div className="market-fund-rank-tabs" aria-label="全市场基金排行类型">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={mode === tab.key ? "active" : ""}
            onClick={() => setMode(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="market-fund-rank-meta">
        <span>{state === "live" ? "天天基金公开排行" : "正在加载公开排行"}</span>
        <span>{dataDate}</span>
      </div>
      {rows.length ? rows.map((fund, index) => (
        <button
          type="button"
          className={`top-fund-mover-row ${selectedFundCode === fund.code ? "selected" : ""}`}
          key={fund.code}
          onClick={() => onSelectFund?.(fund)}
        >
          <b>{String(index + 1).padStart(2, "0")}</b>
          <strong>{fund.name}</strong>
          <em className={(fund.dayChange || 0) >= 0 ? "up" : "down"}>{formatPercent(fund.dayChange)}</em>
        </button>
      )) : (
        <div className="top-fund-mover-empty">
          {unavailableText || "暂无可用全市场基金排行。"}
        </div>
      )}
    </aside>
  );
}

function parseClockLabelToMinutes(label) {
  if (!label || typeof label !== "string") return null;
  const match = label.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function isMiddayBreakPoint(label) {
  const minutes = parseClockLabelToMinutes(label);
  if (minutes == null) return false;
  return minutes > 11 * 60 + 30 && minutes < 13 * 60;
}

function tradingSessionRatio(label) {
  const minutes = parseClockLabelToMinutes(label);
  if (minutes == null) return null;
  const morningStart = 9 * 60 + 30;
  const morningEnd = 11 * 60 + 30;
  const afternoonStart = 13 * 60;
  const afternoonEnd = 15 * 60;
  if (minutes <= morningStart) return 0;
  if (minutes <= morningEnd) return (minutes - morningStart) / 240;
  if (minutes < afternoonStart) return 120 / 240;
  if (minutes <= afternoonEnd) return (120 + (minutes - afternoonStart)) / 240;
  return 1;
}

function IntradayLineChart({ points }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const safePoints = (points || []).filter((item) => !isMiddayBreakPoint(item.time));
  if (!safePoints.length) {
    return <div className="intraday-empty">暂无可用走势</div>;
  }
  const width = 640;
  const height = 260;
  const values = safePoints.map((item) => item.change);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const pad = Math.max(0.6, (max - min) * 0.22);
  const top = max + pad;
  const bottom = min - pad;
  const chartLeft = 28;
  const chartRight = width - 28;
  const chartTop = 22;
  const chartBottom = height - 34;
  const xFor = (item, index) => {
    const ratio = tradingSessionRatio(item.time);
    if (ratio == null) {
      return chartLeft + (index / Math.max(1, safePoints.length - 1)) * (chartRight - chartLeft);
    }
    return chartLeft + ratio * (chartRight - chartLeft);
  };
  const yFor = (value) => chartTop + ((top - value) / (top - bottom)) * (chartBottom - chartTop);
  const chartPoints = safePoints.map((item, index) => ({ x: xFor(item, index), y: yFor(item.change) }));
  const linePath = chartPoints.reduce((path, point, index, source) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = source[index - 1];
    const controlX = (previous.x + point.x) / 2;
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, "");
  const chartEndX = chartPoints.at(-1)?.x ?? chartRight;
  const fillPath = `${linePath} L ${chartEndX} ${chartBottom} L ${chartLeft} ${chartBottom} Z`;
  const positive = safePoints.at(-1)?.change >= 0;
  const hoveredPoint = hoveredIndex == null ? null : safePoints[hoveredIndex];
  const hoveredChartPoint = hoveredIndex == null ? null : chartPoints[hoveredIndex];

  return (
    <div className="line-chart-wrap">
      {hoveredPoint && hoveredChartPoint && (
        <div
          className="line-chart-hover-card"
          style={{ left: `${Math.min(width - 132, Math.max(12, hoveredChartPoint.x - 54))}px` }}
        >
          <strong>{hoveredPoint.time}</strong>
          <span className={hoveredPoint.change >= 0 ? "up" : "down"}>{formatPercent(hoveredPoint.change)}</span>
        </div>
      )}
      <svg className="intraday-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="主题分时走势">
        <defs>
          <linearGradient id="intradayFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={positive ? "#d94835" : "#21965b"} stopOpacity="0.16" />
            <stop offset="1" stopColor={positive ? "#d94835" : "#21965b"} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line className="intraday-baseline" x1={chartLeft} x2={chartRight} y1={yFor(0)} y2={yFor(0)} />
        <path d={fillPath} fill="url(#intradayFill)" />
        <path d={linePath} fill="none" stroke={positive ? "#d94835" : "#21965b"} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        {hoveredChartPoint && (
          <>
            <line className="line-chart-guide" x1={hoveredChartPoint.x} x2={hoveredChartPoint.x} y1={chartTop} y2={chartBottom} />
            <circle className="line-chart-dot" cx={hoveredChartPoint.x} cy={hoveredChartPoint.y} r="4.5" />
          </>
        )}
        {safePoints.map((item, index) => {
          const current = chartPoints[index];
          const previous = chartPoints[index - 1];
          const next = chartPoints[index + 1];
          const left = previous ? (previous.x + current.x) / 2 : chartLeft;
          const right = next ? (current.x + next.x) / 2 : chartRight;
          return (
            <rect
              key={`${item.time}-${index}`}
              className="line-chart-hitbox"
              x={left}
              y={chartTop}
              width={Math.max(8, right - left)}
              height={chartBottom - chartTop}
              fill="transparent"
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex((currentIndex) => (currentIndex === index ? null : currentIndex))}
            />
          );
        })}
        <text x={chartLeft} y={18}>{top.toFixed(2)}%</text>
        <text x={chartLeft} y={height - 2}>{bottom.toFixed(2)}%</text>
        <text x={chartLeft} y={height - 32}>09:30</text>
        <text x={width / 2 - 46} y={height - 32}>11:30/13:00</text>
        <text x={chartRight - 18} y={height - 32}>15:00</text>
      </svg>
    </div>
  );
}
function FundLineChart({ points, positive, percent = true, labelMode = "time" }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const safePoints = (points || []).filter((item) => labelMode !== "time" || !isMiddayBreakPoint(item.time));
  if (!safePoints.length) {
    return <div className="intraday-empty">暂无可用走势</div>;
  }
  const width = 640;
  const height = 260;
  const values = safePoints.map((item) => item.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const pad = Math.max(0.2, (max - min) * 0.22 || Math.abs(max || 1) * 0.08);
  const top = max + pad;
  const bottom = min - pad;
  const chartLeft = 28;
  const chartRight = width - 28;
  const chartTop = 22;
  const chartBottom = height - 34;
  const xFor = (item, index) => {
    if (labelMode !== "time") {
      return chartLeft + (index / Math.max(1, safePoints.length - 1)) * (chartRight - chartLeft);
    }
    const ratio = tradingSessionRatio(item.time);
    if (ratio == null) {
      return chartLeft + (index / Math.max(1, safePoints.length - 1)) * (chartRight - chartLeft);
    }
    return chartLeft + ratio * (chartRight - chartLeft);
  };
  const yFor = (value) => chartTop + ((top - value) / Math.max(1e-6, top - bottom)) * (chartBottom - chartTop);
  const chartPoints = safePoints.map((item, index) => ({ x: xFor(item, index), y: yFor(item.value) }));
  const linePath = chartPoints.reduce((path, point, index, source) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = source[index - 1];
    const controlX = (previous.x + point.x) / 2;
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, "");
  const chartEndX = chartPoints.at(-1)?.x ?? chartRight;
  const fillPath = `${linePath} L ${chartEndX} ${chartBottom} L ${chartLeft} ${chartBottom} Z`;
  const toneUp = positive ?? safePoints.at(-1)?.value >= safePoints[0]?.value;
  const tone = toneUp ? "#d94835" : "#21965b";
  const hoveredPoint = hoveredIndex == null ? null : safePoints[hoveredIndex];
  const hoveredChartPoint = hoveredIndex == null ? null : chartPoints[hoveredIndex];
  const labelAt = (index) => {
    const point = safePoints[index];
    if (!point) return "";
    return labelMode === "date" ? point.date.slice(5) : point.time;
  };
  const formatValue = (value) => (percent ? `${value.toFixed(2)}%` : value.toFixed(4));

  return (
    <div className="line-chart-wrap">
      {hoveredPoint && hoveredChartPoint && (
        <div
          className="line-chart-hover-card"
          style={{ left: `${Math.min(width - 132, Math.max(12, hoveredChartPoint.x - 54))}px` }}
        >
          <strong>{labelMode === "time" ? hoveredPoint.time : hoveredPoint.date}</strong>
          <span className={hoveredPoint.value >= 0 ? "up" : "down"}>{formatValue(hoveredPoint.value)}</span>
        </div>
      )}
      <svg className="intraday-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="基金走势">
        <defs>
          <linearGradient id="fundDetailFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={tone} stopOpacity="0.16" />
            <stop offset="1" stopColor={tone} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line className="intraday-baseline" x1={chartLeft} x2={chartRight} y1={yFor(percent ? 0 : min)} y2={yFor(percent ? 0 : min)} />
        <path d={fillPath} fill="url(#fundDetailFill)" />
        <path d={linePath} fill="none" stroke={tone} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        {hoveredChartPoint && (
          <>
            <line className="line-chart-guide" x1={hoveredChartPoint.x} x2={hoveredChartPoint.x} y1={chartTop} y2={chartBottom} />
            <circle className="line-chart-dot" cx={hoveredChartPoint.x} cy={hoveredChartPoint.y} r="4.5" />
          </>
        )}
        {safePoints.map((item, index) => {
          const current = chartPoints[index];
          const previous = chartPoints[index - 1];
          const next = chartPoints[index + 1];
          const left = previous ? (previous.x + current.x) / 2 : chartLeft;
          const right = next ? (current.x + next.x) / 2 : chartRight;
          return (
            <rect
              key={`${labelMode}-${labelAt(index)}-${index}`}
              className="line-chart-hitbox"
              x={left}
              y={chartTop}
              width={Math.max(8, right - left)}
              height={chartBottom - chartTop}
              fill="transparent"
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex((currentIndex) => (currentIndex === index ? null : currentIndex))}
            />
          );
        })}
        <text x={chartLeft} y={18}>{formatValue(top)}</text>
        <text x={chartLeft} y={height - 2}>{formatValue(bottom)}</text>
        <text x={chartLeft} y={height - 32}>{labelMode === "time" ? "09:30" : labelAt(0)}</text>
        <text x={width / 2 - 46} y={height - 32}>{labelMode === "time" ? "11:30/13:00" : labelAt(Math.floor((safePoints.length - 1) / 2))}</text>
        <text x={chartRight - 18} y={height - 32}>{labelMode === "time" ? "15:00" : labelAt(safePoints.length - 1)}</text>
      </svg>
    </div>
  );
}
function FundDetailPage({ fund, detail, state, onBack }) {
  const [activeTab, setActiveTab] = useState("intraday");

  useEffect(() => {
    setActiveTab("intraday");
  }, [fund?.code]);

  if (state === "loading") {
    return <section className="fund-detail-page loading">正在加载基金详情...</section>;
  }

  if (!detail?.fund) {
    return (
      <section className="fund-detail-page loading">
        <button type="button" className="fund-detail-back" onClick={onBack}>返回主题榜</button>
        暂无可用基金详情。
      </section>
    );
  }

  const fundMeta = detail.fund;
  const currentChange = Number.isFinite(fundMeta.estimatedChange) ? fundMeta.estimatedChange : fund?.dayChange;
  const historyCurve = (detail.historyCurve || []).map((item) => ({ date: item.date, value: item.value }));
  const performanceCurve = (detail.performanceCurve || []).map((item) => ({ date: item.date, value: item.value }));
  const recentHistory = detail.navHistory || [];
  const stageMetrics = detail.stageMetrics || [];
  const holdings = detail.holdings || [];

  return (
    <section className="fund-detail-page">
      <div className="fund-detail-topbar">
        <button type="button" className="fund-detail-back" onClick={onBack}>返回主题榜</button>
        <span>基金详情</span>
      </div>

      <article className="fund-detail-hero">
        <div className="fund-detail-head">
          <div>
            <small>{fundMeta.code}</small>
            <h1>{fundMeta.name || fund?.name}</h1>
            <p>
              {fund?.type || "基金"}
              {" · "}
              {detail?.trendGranularity === "intraday" ? "实时估算 " : "最近净值 "}
              {fundMeta.latestNavDate || "--"}
            </p>
          </div>
          <strong className={(currentChange || 0) >= 0 ? "up" : "down"}>{formatPercent(currentChange)}</strong>
        </div>

        <div className="topic-metrics fund-detail-metrics">
          <span>最新净值<b>{formatNav(fundMeta.latestNav)}</b></span>
          <span>近 1 月<b>{formatPercent(fundMeta.month)}</b></span>
          <span>近 3 月<b>{formatPercent(fundMeta.quarter)}</b></span>
          <span>近 6 月<b>{formatPercent(fundMeta.halfYear)}</b></span>
        </div>

        <div className="data-badges fund-detail-badges">
          <span className="source-status live">实时估值 / 净值 / 持仓</span>
          <span>公开接口 / 天天基金 / 东方财富</span>
          <span>季报持仓口径</span>
        </div>

        <div className="fund-detail-tabs" aria-label="基金详情切换">
          <button className={activeTab === "intraday" ? "active" : ""} onClick={() => setActiveTab("intraday")}>实时</button>
          <button className={activeTab === "history" ? "active" : ""} onClick={() => setActiveTab("history")}>历史净值</button>
          <button className={activeTab === "return" ? "active" : ""} onClick={() => setActiveTab("return")}>阶段涨幅</button>
          <button className={activeTab === "drawdown" ? "active" : ""} onClick={() => setActiveTab("drawdown")}>阶段回撤</button>
        </div>

        {activeTab === "intraday" && (
          <>
            <FundLineChart
              points={(detail.intraday || []).map((item) => ({ ...item, value: item.change }))}
              positive={(currentChange || 0) >= 0}
              percent
              labelMode="time"
            />
            <p className="fund-detail-note">
              {detail.trendGranularity === "previous_intraday"
                ? `实时分时不可用时，自动回退为上一交易日走势（交易日 ${detail.intradaySessionDate || "--"}）。`
                : `当前展示基金分时估算走势（交易日 ${detail.intradaySessionDate || "--"}）。`}
            </p>
          </>
        )}

        {activeTab === "history" && (
          <>
            <FundLineChart points={historyCurve} positive percent={false} labelMode="date" />
            <div className="fund-history-table">
              <div className="fund-history-head">
                <span>日期</span>
                <span>单位净值</span>
                <span>日涨跌</span>
              </div>
              {recentHistory.map((item) => (
                <div className="fund-history-row" key={item.date}>
                  <span>{item.date.slice(5)}</span>
                  <strong>{formatNav(item.nav)}</strong>
                  <em className={(item.dailyChange || 0) >= 0 ? "up" : "down"}>{formatPercent(item.dailyChange)}</em>
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === "return" && (
          <>
            <FundLineChart points={performanceCurve} positive={(performanceCurve.at(-1)?.value || 0) >= 0} percent labelMode="date" />
            <div className="fund-stage-table">
              <div className="fund-stage-head">
                <span>区间</span>
                <span>本基金</span>
                <span>沪深 300</span>
                <span>超额收益</span>
              </div>
              {stageMetrics.map((item) => (
                <div className="fund-stage-row" key={item.key}>
                  <span>{item.label}</span>
                  <strong className={(item.fundReturn || 0) >= 0 ? "up" : "down"}>{formatPercent(item.fundReturn)}</strong>
                  <em className={(item.benchmarkReturn || 0) >= 0 ? "up" : "down"}>{formatPercent(item.benchmarkReturn)}</em>
                  <b className={(item.excessReturn || 0) >= 0 ? "up" : "down"}>{formatPercent(item.excessReturn)}</b>
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === "drawdown" && (
          <div className="fund-stage-table">
            <div className="fund-stage-head">
              <span>区间</span>
              <span>本基金</span>
              <span>沪深 300</span>
            </div>
            {stageMetrics.map((item) => (
              <div className="fund-stage-row" key={item.key}>
                <span>{item.label}</span>
                <strong className={(item.fundDrawdown || 0) >= 0 ? "up" : "down"}>{formatPercent(item.fundDrawdown)}</strong>
                <em className={(item.benchmarkDrawdown || 0) >= 0 ? "up" : "down"}>{formatPercent(item.benchmarkDrawdown)}</em>
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="fund-holding-card">
        <div className="section-heading">
          <h2>重仓股票</h2>
          <span>{detail.holdingsQuarter ? `${detail.holdingsQuarter} 持仓` : "最近季度持仓"}</span>
        </div>
        <div className="fund-holding-head">
          <span>股票</span>
          <span>涨跌幅</span>
          <span>持仓占比</span>
        </div>
        {holdings.map((item) => (
          <div className="fund-holding-row" key={`${item.code}-${item.name}`}>
            <div className="fund-holding-name">
              <strong>{item.name}</strong>
              <small>{item.code}</small>
            </div>
            <em className={(item.dayChange || 0) >= 0 ? "up" : "down"}>
              {Number.isFinite(item.dayChange) ? formatPercent(item.dayChange) : "--"}
            </em>
            <span>{formatRatio(item.weight)}</span>
          </div>
        ))}
        {!holdings.length && <div className="fund-rank-empty">这个基金暂时没有可展示的公开持仓明细。</div>}
      </article>
    </section>
  );
}

function TopicFundComparison({ funds, onOpenFund }) {
  const [fundSort, setFundSort] = useState("day");
  const fundSortConfig = {
    day: { key: "dayChange", label: "日排序" },
    week: { key: "week", label: "周排序" },
    month: { key: "month", label: "月排序" },
  }[fundSort];
  const sortedFunds = [...(funds || [])].sort((a, b) => (b[fundSortConfig.key] || 0) - (a[fundSortConfig.key] || 0));
  return (
    <aside className="topic-fund-card">
      <div className="section-heading">
        <h2>主题基金比较</h2>
        <div className="fund-sort-tabs" aria-label="主题基金排序">
          <button className={fundSort === "day" ? "active" : ""} onClick={() => setFundSort("day")}>日</button>
          <button className={fundSort === "week" ? "active" : ""} onClick={() => setFundSort("week")}>周</button>
          <button className={fundSort === "month" ? "active" : ""} onClick={() => setFundSort("month")}>月</button>
        </div>
      </div>
      <div className="topic-fund-list">
        {sortedFunds.slice(0, 9).map((fund, index) => (
          <button
            type="button"
            className="topic-fund-row"
            key={fund.code}
            onClick={() => onOpenFund?.(fund)}
          >
            <span className={index < 3 ? "hot-rank" : ""}>{String(index + 1).padStart(2, "0")}</span>
            <strong>{fund.name}</strong>
            <em className={(fund[fundSortConfig.key] || 0) >= 0 ? "up" : "down"}>{formatPercent(fund[fundSortConfig.key])}</em>
            <b>{fundSortConfig.label}</b>
          </button>
        ))}
        {!sortedFunds.length && <div className="fund-rank-empty">当前主题暂时没有可比较基金。</div>}
      </div>
    </aside>
  );
}

function SelectedFundPanel({ fund, detail, state, topicDetail, onClear, onOpenFund }) {
  const fundMeta = detail?.fund;
  const currentChange = Number.isFinite(fundMeta?.estimatedChange) ? fundMeta.estimatedChange : fund?.dayChange;
  const chartPoints = (detail?.intraday || []).map((item) => ({ ...item, value: item.change }));
  const currentPoint = chartPoints.at(-1);
  const holdings = detail?.holdings || [];
  return (
    <section className="topic-detail-panel selected-fund-panel">
      <article className="topic-chart-card">
        <div className="topic-detail-head">
          <div>
            <span>{fundMeta?.code || fund.code}</span>
            <h2>{fundMeta?.name || fund.name || fund.shortName}</h2>
          </div>
          <strong className={(currentChange || 0) >= 0 ? "up" : "down"}>{formatPercent(currentChange)}</strong>
        </div>
        <div className="topic-metrics">
          <span>天天基金估值 <b>{formatPercent(currentChange)}</b></span>
          <span>曲线当前点 <b>{formatPercent(currentPoint?.value)}</b></span>
          <span>近 1 月 <b>{formatPercent(fundMeta?.month ?? fund.month)}</b></span>
          <span>近 3 月 <b>{formatPercent(fundMeta?.quarter ?? fund.quarter)}</b></span>
        </div>
        {state === "loading" ? (
          <div className="intraday-empty">正在加载基金实时走势...</div>
        ) : (
          <FundLineChart
            points={chartPoints}
            positive={(currentChange || 0) >= 0}
            percent
            labelMode="time"
          />
        )}
        <p>
          {detail?.trendGranularity === "previous_intraday"
            ? `实时分时不可用时，自动回退为上一交易日走势（交易日 ${detail?.intradaySessionDate || "--"}）。`
            : `顶部涨跌优先使用天天基金公开估值；曲线由重仓股分时聚合，仅作盘中方向参考（交易日 ${detail?.intradaySessionDate || "--"}）。`}
          <button type="button" className="text-link-button" onClick={onClear}>返回主题走势</button>
        </p>
      </article>
      <TopicFundComparison funds={topicDetail?.funds || []} onOpenFund={onOpenFund} />
      {!!holdings.length && (
        <article className="fund-holding-card inline-holdings">
          <div className="section-heading">
            <h2>重仓股票</h2>
            <span>{detail?.holdingsQuarter ? `${detail.holdingsQuarter} 持仓` : "最近季度持仓"}</span>
          </div>
          <div className="fund-holding-head">
            <span>股票</span>
            <span>涨跌幅</span>
            <span>持仓占比</span>
          </div>
          {holdings.slice(0, 8).map((item) => (
            <div className="fund-holding-row" key={`${item.code}-${item.name}`}>
              <div className="fund-holding-name">
                <strong>{item.name}</strong>
                <small>{item.code}</small>
              </div>
              <em className={(item.dayChange || 0) >= 0 ? "up" : "down"}>
                {Number.isFinite(item.dayChange) ? formatPercent(item.dayChange) : "--"}
              </em>
              <span>{formatRatio(item.weight)}</span>
            </div>
          ))}
        </article>
      )}
    </section>
  );
}

function TopicDetailPanel({ detail, state, onOpenFund }) {
  const topic = detail?.topic;
  if (state === "loading") {
    return <section className="topic-detail-panel loading">正在加载主题详情...</section>;
  }
  if (!topic) return null;
  return (
    <section className="topic-detail-panel">
      <article className="topic-chart-card">
        <div className="topic-detail-head">
          <div>
            <span>{topic.code}</span>
            <h2>{topic.name}</h2>
          </div>
          <strong className={(topic.dayChange || 0) >= 0 ? "up" : "down"}>{formatPercent(topic.dayChange)}</strong>
        </div>
        <div className="topic-metrics">
          <span>主题强度 <b>{Number.isFinite(topic.strength) ? topic.strength.toFixed(1) : "--"}</b></span>
          <span>近 1 月 <b>{formatPercent(topic.month)}</b></span>
          <span>近 3 月 <b>{formatPercent(topic.quarter)}</b></span>
        </div>
        <IntradayLineChart points={detail.intraday} />
        <p>
          {detail?.trendGranularity === "previous_intraday"
            ? `\u5206\u65f6\u4e0d\u53ef\u7528\u65f6\uff0c\u81ea\u52a8\u56de\u9000\u4e3a\u4e0a\u4e00\u4e2a\u4ea4\u6613\u65e5\u7684\u4e3b\u9898\u5206\u65f6\u805a\u5408${detail?.intradaySessionDate ? `\uff08\u4ea4\u6613\u65e5 ${detail.intradaySessionDate}\uff09` : ""}\u3002`
            : detail?.intradayFallback
              ? "\u5f53\u524d\u5c55\u793a\u6700\u8fd1\u4e00\u6b21\u6210\u529f\u6293\u53d6\u7684\u4e3b\u9898\u5206\u65f6\u805a\u5408\uff0c\u7528\u4e8e\u907f\u514d\u4e0a\u6e38\u77ed\u65f6\u7f3a\u53e3\u5bfc\u81f4\u7a7a\u767d\u3002"
              : `\u5f53\u65e5\u8d70\u52bf\u7531\u4e3b\u9898\u76f8\u5173\u6301\u4ed3\u80a1\u7968\u5206\u65f6\u7b49\u6743\u805a\u5408${detail?.intradaySessionDate ? `\uff08\u4ea4\u6613\u65e5 ${detail.intradaySessionDate}\uff09` : ""}\uff0c\u4ec5\u7528\u4e8e\u89c2\u5bdf\u4e3b\u9898\u76d8\u4e2d\u65b9\u5411\u3002`}
        </p>
      </article>
      <TopicFundComparison funds={detail?.funds || []} onOpenFund={onOpenFund} />
    </section>
  );
}

function SignalRow({ signal, selected, onSelect }) {
  const Icon = signal.icon;
  return (
    <button className={`signal-row ${selected ? "selected" : ""}`} onClick={onSelect}>
      <span className="signal-icon"><Icon size={18} /></span>
      <span className="signal-copy">
        <strong>{signal.name}</strong>
        <small>{signal.detail}</small>
      </span>
      <span className={`signal-pill ${toneForScore(signal.score)}`}>{signal.value}</span>
      <span className="signal-score">{signal.score}</span>
    </button>
  );
}

function ContributionPanel({ signals }) {
  const sorted = [...signals].sort((a, b) => Math.abs(b.score - previousScoreFor(b)) - Math.abs(a.score - previousScoreFor(a)));
  return (
    <div className="contribution-panel">
      <div className="section-heading">
        <h2>组成影响</h2>
        <span>当前分 - 上一同口径分</span>
      </div>
      <div className="contribution-list">
        {sorted.map((signal) => {
          const delta = signal.score - previousScoreFor(signal);
          return (
            <div className="contribution-row" key={signal.name}>
              <span>{signal.name}</span>
              <div className="contribution-track">
                <i style={{ width: `${Math.min(100, Math.abs(delta) * 7)}%` }} className={delta >= 0 ? "up" : "down"} />
              </div>
              <strong className={delta >= 0 ? "up" : "down"}>{delta >= 0 ? "+" : ""}{delta}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompositePopover({ signals, range }) {
  const weight = signals.length ? 100 / signals.length : 0;
  return (
    <div className="composite-popover" role="dialog" aria-label="加权组成说明">
      <p>
        当前总分按 <strong>{signals.length || 0}</strong> 个市场信号等权平均计算，
        当前口径为 <strong>{rangeMeta(range).shortLabel}</strong>。
      </p>
      <div className="composite-popover-list">
        {signals.map((signal) => (
          <div className="composite-popover-row" key={signal.name}>
            <span>{signal.name}</span>
            <em>{weight.toFixed(1)}%</em>
            <strong>{signal.score}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [range, setRange] = useState("1D");
  const [candleRange, setCandleRange] = useState("daily");
  const [viewMode, setViewMode] = useState("market");
  const [shanghaiNow, setShanghaiNow] = useState(() => new Date());
  const [selectedSignalName, setSelectedSignalName] = useState(fallbackSignals[0].name);
  const [marketModel, setMarketModel] = useState({
    snapshots: fallbackSnapshots,
    signals: fallbackSignals,
    meta: {
      close: null,
      date: "2026年5月16日",
      source: "离线样例数据",
    },
    candles: fallbackCandles,
  });
  const [loadState, setLoadState] = useState("loading");
  const [candleLoadState, setCandleLoadState] = useState("loading");
  const [eastmoneyState, setEastmoneyState] = useState({
    status: "loading",
    message: "正在加载东方财富公开数据",
  });
  const [fundState, setFundState] = useState("loading");
  const [fundCategories, setFundCategories] = useState([]);
  const [fundCategoriesRefreshedAt, setFundCategoriesRefreshedAt] = useState(null);
  const [fundTopicState, setFundTopicState] = useState("loading");
  const [fundTopics, setFundTopics] = useState([]);
  const [fundTopicsRefreshedAt, setFundTopicsRefreshedAt] = useState(null);
  const [fundMarketRankingState, setFundMarketRankingState] = useState("loading");
  const [fundMarketRankings, setFundMarketRankings] = useState(null);
  const [liveQuote, setLiveQuote] = useState(null);
  const [showCompositePopover, setShowCompositePopover] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setShanghaiNow(new Date());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchShanghaiCompositeModel()
      .catch((error) => {
        console.warn(error);
        return fetchYahooShanghaiCompositeModel();
      })
      .then((model) => {
        if (cancelled) return;
        setMarketModel(model);
        setLoadState("live");
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn(error);
        setLoadState("fallback");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadQuote = () => {
      fetchShanghaiCompositeQuote()
        .then((payload) => {
          if (cancelled) return;
          setLiveQuote(payload.quote || null);
        })
        .catch((error) => {
          if (cancelled) return;
          console.warn(error);
        });
    };
    loadQuote();
    const timer = window.setInterval(loadQuote, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadEastmoneySignals = () => {
      fetchEastmoneySignals()
        .then((payload) => {
          if (cancelled) return;
          if (!payload.configured) {
            setEastmoneyState({ status: "error", message: "东方财富公开数据暂不可用" });
            return;
          }
          if (!payload.signals.length) {
            setEastmoneyState({
              status: "empty",
              message: "东方财富补充信号暂缺，主信号仍按实时行情计算",
            });
            return;
          }
          setMarketModel((current) => mergeSignalsWithSnapshot(current, payload.signals));
          setEastmoneyState({
            status: "live",
            message: `东方财富已接入 ${payload.signals.length} 个补充信号`,
          });
        })
        .catch((error) => {
          if (cancelled) return;
          console.warn(error);
          setEastmoneyState({ status: "error", message: "东方财富公开数据暂不可用" });
        });
    };
    loadEastmoneySignals();
    const timer = window.setInterval(loadEastmoneySignals, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const config = candleRanges.find((item) => item.key === candleRange) || candleRanges[2];
    setCandleLoadState("loading");
    fetchCandlesForRange(config)
      .then((candles) => {
        if (cancelled) return;
        setMarketModel((current) => ({
          ...current,
          candles: {
            ...current.candles,
            [config.key]: candles,
          },
        }));
        setCandleLoadState("live");
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn(error);
        setCandleLoadState("fallback");
      });
    return () => {
      cancelled = true;
    };
  }, [candleRange]);

  useEffect(() => {
    let cancelled = false;
    const loadFundCategories = (initial = false) => {
      if (initial) setFundState("loading");
      fetchFundCategories()
        .then((payload) => {
          if (cancelled) return;
          const categories = payload.categories || [];
          setFundCategories(categories);
          setFundCategoriesRefreshedAt(payload.refreshedAt || null);
          setFundState(categories.length ? "live" : "empty");
        })
        .catch((error) => {
          if (cancelled) return;
          console.warn(error);
          setFundCategories([]);
          setFundState("error");
        });
    };
    loadFundCategories(true);
    const timer = window.setInterval(() => loadFundCategories(false), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadFundTopics = (initial = false) => {
      if (initial) setFundTopicState("loading");
      const applyPayload = (payload) => {
        if (cancelled) return;
        const topics = payload.topics || [];
        setFundTopics(topics);
        setFundTopicsRefreshedAt(payload.refreshedAt || null);
        setFundTopicState(topics.length ? "live" : "empty");
      };
      const keepPreviousTopics = (error) => {
        if (cancelled) return;
        console.warn(error);
        setFundTopics((current) => {
          setFundTopicState(current.length ? "stale" : "error");
          return current;
        });
      };
      fetchFundTopics(false)
        .then((payload) => {
          if (cancelled) return;
          const topics = payload.topics || [];
          if (topics.length) {
            applyPayload(payload);
            return null;
          }
          return fetchFundTopics(true).then(applyPayload);
        })
        .catch((error) => {
          fetchFundTopics(true)
            .then(applyPayload)
            .catch(() => keepPreviousTopics(error));
        });
    };
    loadFundTopics(true);
    const timer = window.setInterval(() => loadFundTopics(false), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadFundMarketRankings = (initial = false) => {
      if (initial) setFundMarketRankingState("loading");
      fetchFundMarketRankings()
        .then((payload) => {
          if (cancelled) return;
          setFundMarketRankings(payload);
          const hasRankings = (payload.gainers?.length || 0) + (payload.losers?.length || 0);
          setFundMarketRankingState(hasRankings ? "live" : "empty");
        })
        .catch((error) => {
          if (cancelled) return;
          console.warn(error);
          setFundMarketRankings(null);
          setFundMarketRankingState("error");
        });
    };
    loadFundMarketRankings(true);
    const timer = window.setInterval(() => loadFundMarketRankings(false), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const signals = marketModel.signals;
  const signalsForRange = signals.map((signal) => {
    const score = scoreForRange(signal, range);
    return {
      ...signal,
      score,
      previousScore: previousScoreForRange(signal, range),
      value: labelForScore(score),
    };
  });
  const rangeComposite = recomputeComposite(signalsForRange);
  const data = {
    ...marketModel.snapshots[range],
    score: rangeComposite.score,
    previous: rangeComposite.previous,
    delta: rangeComposite.delta,
    label: labelForScore(rangeComposite.score),
  };
  const selectedSignal = signalsForRange.find((signal) => signal.name === selectedSignalName) || signalsForRange[0];
  const tone = toneForScore(data.score);
  const candleConfig = candleRanges.find((item) => item.key === candleRange) || candleRanges[2];
  const activeRange = rangeMeta(range);
  const chinaClock = formatShanghaiClock(shanghaiNow);
  const quoteCandles = (marketModel.candles[candleRange] || []).filter((item) => (
    item
    && Number.isFinite(item.open)
    && Number.isFinite(item.high)
    && Number.isFinite(item.low)
    && Number.isFinite(item.close)
  ));
  const latestQuoteCandle = quoteCandles.at(-1) || null;
  const previousQuoteCandle = quoteCandles.at(-2) || null;
  const liveIndex = liveQuote?.close ?? latestQuoteCandle?.close ?? marketModel.meta.close ?? null;
  const liveChangePoints = Number.isFinite(liveQuote?.change)
    ? liveQuote.change
    : latestQuoteCandle && previousQuoteCandle
    ? latestQuoteCandle.close - previousQuoteCandle.close
    : null;
  const liveChangePercent = Number.isFinite(liveQuote?.changePercent)
    ? liveQuote.changePercent
    : latestQuoteCandle && previousQuoteCandle && previousQuoteCandle.close
    ? ((latestQuoteCandle.close - previousQuoteCandle.close) / previousQuoteCandle.close) * 100
    : null;
  const liveIndexDate = liveQuote?.date
    ? new Date(`${liveQuote.date}T00:00:00+08:00`).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })
    : latestQuoteCandle
    ? new Date(latestQuoteCandle.timestamp * 1000).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })
    : marketModel.meta.date;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            {viewMode === "market" ? <Gauge size={18} strokeWidth={2.3} /> : <BarChart3 size={18} strokeWidth={2.3} />}
          </span>
          <span>{viewMode === "market" ? "中国恐惧与贪婪指数" : "基金主题榜"}</span>
        </div>
        {viewMode === "market" && (
          <nav aria-label="页面导航">
            <a href="#market">行情</a>
            <a href="#sentiment">情绪</a>
            <a href="#signals">信号</a>
            <a href="#history">历史</a>
            <a href="#funds">基金</a>
          </nav>
        )}
        <div className="header-actions">
          <button className="mode-toggle" onClick={() => setViewMode(viewMode === "market" ? "funds" : "market")}>
            {viewMode === "market" ? "基金榜单" : "市场仪表盘"}
          </button>
          {viewMode === "market" && (
            <>
              <button aria-label="搜索"><Search size={17} /></button>
              <button aria-label="提醒"><Bell size={17} /></button>
              <div className="date-display" aria-label="北京时间">
                <CalendarDays size={16} />
                <div>
                  <strong>{chinaClock.dateLabel}</strong>
                  <span>{chinaClock.timeLabel}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      {viewMode === "funds" ? (
        <FundOnlyPage
          topics={fundTopics}
          state={fundTopicState}
          refreshedAt={fundTopicsRefreshedAt || fundCategoriesRefreshedAt}
          marketRankings={fundMarketRankings}
          marketRankingState={fundMarketRankingState}
          onBack={() => setViewMode("market")}
        />
      ) : (
        <>

      <section id="market" className="page-title">
        <div>
          <h1>上证综指情绪仪表盘</h1>
          <p>七个真实行情信号汇总为一个 A 股情绪读数。</p>
          <div className="data-badges">
            <span>真实：上证综指价格 / OHLC / K 线</span>
            <span>信号：{signals.length} 个真实数据项</span>
            <span className={`source-status ${eastmoneyState.status}`}>{eastmoneyState.message}</span>
          </div>
        </div>
        <div className="page-title-side">
          <div className="live-index-card" aria-label="当前指数">
            <small>{candleConfig.label}指数</small>
            <strong>{Number.isFinite(liveIndex) ? liveIndex.toFixed(2) : "--"}</strong>
            <div className="live-index-meta">
              <span className={liveChangePoints != null && liveChangePoints >= 0 ? "up" : "down"}>
                {liveChangePoints == null ? "--" : `${liveChangePoints >= 0 ? "+" : ""}${liveChangePoints.toFixed(2)}`}
              </span>
              <span className={liveChangePercent != null && liveChangePercent >= 0 ? "up" : "down"}>
                {liveChangePercent == null ? "--" : formatPercent(liveChangePercent)}
              </span>
              <em>{liveIndexDate || "--"}</em>
            </div>
          </div>
          <div className="range-tabs" aria-label="时间范围">
            {rangeOptions.map((item) => (
              <button key={item.key} className={range === item.key ? "active" : ""} onClick={() => setRange(item.key)}>
                {item.shortLabel}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section id="sentiment" className="dashboard-grid">
        <article className={`gauge-panel ${tone}`}>
          <div className="panel-header">
            <span>当前读数</span>
            <strong className={data.delta >= 0 ? "up" : "down"}>{data.delta >= 0 ? "+" : ""}{data.delta} 较上次</strong>
          </div>
          <GaugeDial score={data.score} label={data.label} />
          <div className="gauge-insights">
            <div className="gauge-insight-card">
              <span>{activeRange.longLabel}变化</span>
              <strong className={data.delta >= 0 ? "up" : "down"}>
                {data.delta >= 0 ? "+" : ""}{data.delta}
              </strong>
              <small>{describeDelta(data.delta)}</small>
            </div>
            <div className="gauge-insight-card">
              <span>{activeRange.longLabel}区间定位</span>
              <MiniSentimentBand score={data.score} label={data.label} />
              <small>当前读数落在 0 到 100 刻度中的位置</small>
            </div>
            <div className="gauge-insight-card">
              <span>位置说明</span>
              <strong>{selectedSignal.score}</strong>
              <small>{selectedSignal.name}</small>
            </div>
          </div>
          <div className="score-strip">
            <div><span>上一读数</span><strong>{data.previous}</strong></div>
            <div><span>一周前</span><strong>{data.week}</strong></div>
            <div><span>一月前</span><strong>{data.month}</strong></div>
          </div>
        </article>

        <aside className="summary-panel">
          <div className="summary-top">
            <span className={`status-dot ${tone}`} />
            <div>
              <h2>{data.label}</h2>
              <p>
                {loadState === "live"
                  ? "读数使用上证综指行情与东方财富公开 A 股实时样本计算。"
                  : "实时行情暂不可用，当前显示离线样例数据。"}
              </p>
            </div>
          </div>
          <div className="selected-signal">
            <span>选中信号</span>
            <strong>{selectedSignal.name}</strong>
            <p>{selectedSignal.detail}</p>
          </div>
          <div className="thermometer">
            <span style={{ left: `${data.score}%` }} />
          </div>
          <div className="thermo-labels">
            <span>极度恐惧</span>
            <span>中性</span>
            <span>极度贪婪</span>
          </div>
          <ContributionPanel signals={signalsForRange} />
        </aside>
      </section>

      <section className="lower-grid">
        <article id="signals" className="signals-panel">
          <div className="section-heading">
            <h2>市场信号</h2>
            <div className="section-heading-meta">
              <button
                type="button"
                className={`ghost-info-button ${showCompositePopover ? "active" : ""}`}
                onClick={() => setShowCompositePopover((current) => !current)}
              >
                加权组成
              </button>
            </div>
          </div>
          {showCompositePopover && <CompositePopover signals={signalsForRange} range={range} />}
          <div className="signals-list">
            {signalsForRange.map((signal) => (
              <SignalRow
                key={signal.name}
                signal={signal}
                selected={selectedSignal.name === signal.name}
                onSelect={() => setSelectedSignalName(signal.name)}
              />
            ))}
          </div>
        </article>

        <article id="history" className="trend-panel">
          <div className="section-heading">
            <h2>历史走势</h2>
            <span>{range} 情绪路径</span>
          </div>
          <TrendChart values={data.history} />
          <div className="section-heading candle-heading">
            <h2>K 线走势</h2>
            <span>{candleLoadState === "live" ? "实时行情" : "回退数据"} · {candleConfig.note}</span>
          </div>
          <div className="candle-tabs" aria-label="K 线周期">
            {candleRanges.map((item) => (
              <button
                key={item.key}
                className={candleRange === item.key ? "active" : ""}
                onClick={() => setCandleRange(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <CandlestickChart candles={marketModel.candles[candleRange]} periodNote={candleConfig.note} />
          <div className="news-strip">
            <strong>{loadState === "live" ? "实时数据说明" : "市场简报"}</strong>
            <p>
              {loadState === "live"
                ? `${marketModel.meta.source}。${eastmoneyState.message}。`
                : "当前为离线样例数据。"}
            </p>
          </div>
        </article>
      </section>

      <FundCategoryPanel categories={fundCategories} state={fundState} onOpenFull={() => setViewMode("funds")} />
        </>
      )}
      <footer className="site-disclaimer">
        数据来自公开行情与基金主题接口，仅供娱乐、学习和产品原型展示，不构成任何投资建议。
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
