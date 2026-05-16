import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  Gauge,
  Search,
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

const ranges = ["1D", "1W", "1M", "1Y"];
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

function getRangePoints(points, range) {
  const rangeSize = { "1D": 24, "1W": 40, "1M": 66, "1Y": 180 }[range] || 66;
  return points.slice(-rangeSize);
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
  const response = await fetch("/api/yahoo/v8/finance/chart/000001.SS?range=1y&interval=1d");
  if (!response.ok) throw new Error(`Quote request failed: ${response.status}`);
  const payload = await response.json();
  const points = parseYahooChartPoints(payload);

  if (points.length < 30) throw new Error("Not enough Shanghai Composite history to calculate sentiment.");
  return buildLiveModel(points);
}

async function fetchCandlesForRange(config) {
  const response = await fetch(`/api/yahoo/v8/finance/chart/000001.SS?range=${config.range}&interval=${config.interval}`);
  if (!response.ok) throw new Error(`K 线请求失败：${response.status}`);
  const payload = await response.json();
  const points = parseYahooChartPoints(payload);
  if (!points.length) throw new Error("K 线响应为空。");
  return points;
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

  return (
    <div className="candle-chart-wrap">
      <svg className="candle-chart" viewBox="0 0 860 250" role="img" aria-label="上证综指 K 线图，含 MA5 MA10 MA20 均线">
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
              <rect x={x - bodyWidth / 2} y={bodyY} width={bodyWidth} height={bodyHeight} rx="2" />
            </g>
          );
        })}
        <text className="axis-note" x="72" y="238">{periodNote} · {safeCandles.length} 根 K 线</text>
      </svg>
      <div className="ma-legend" aria-label="均线图例">
        <span><i className="ma5" />MA5</span>
        <span><i className="ma10" />MA10</span>
        <span><i className="ma20" />MA20</span>
      </div>
    </div>
  );
}

async function fetchFundCategories() {
  const response = await fetch("/api/eastmoney/fund-categories");
  if (!response.ok) throw new Error(`基金分类接口失败：${response.status}`);
  const payload = await response.json();
  return payload.categories || [];
}

async function fetchFundTopics() {
  const response = await fetch("/api/eastmoney/fund-topics");
  if (!response.ok) throw new Error(`基金主题接口失败：${response.status}`);
  const payload = await response.json();
  return payload.topics || [];
}

async function fetchFundTopicDetail(code) {
  const response = await fetch(`/api/eastmoney/fund-topic-detail?code=${encodeURIComponent(code)}`);
  if (!response.ok) throw new Error(`基金主题详情接口失败：${response.status}`);
  return response.json();
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function FundCategoryPanel({ categories, state, onOpenFull }) {
  const sorted = [...categories].sort((a, b) => b.monthAvg - a.monthAvg);
  const maxAbs = Math.max(1, ...sorted.map((item) => Math.abs(item.monthAvg || 0)));
  return (
    <section id="funds" className="fund-section">
      <div className="section-heading">
        <h2>基金分类涨幅</h2>
        <div className="section-actions">
          <span>{state === "live" ? "东方财富 / 天天基金公开排行样本" : "正在加载公开数据"}</span>
          <button onClick={onOpenFull}>进入基金榜单</button>
        </div>
      </div>
      <div className="fund-grid">
        {sorted.map((item) => {
          const tone = item.monthAvg >= 0 ? "up" : "down";
          const width = `${Math.max(8, (Math.abs(item.monthAvg) / maxAbs) * 100)}%`;
          return (
            <article className="fund-card" key={item.key}>
              <div className="fund-card-top">
                <strong>{item.label}</strong>
                <span className={tone}>{formatPercent(item.monthAvg)}</span>
              </div>
              <div className="fund-bar" aria-hidden="true">
                <i className={tone} style={{ width }} />
              </div>
              <div className="fund-metrics">
                <span>日均 {formatPercent(item.dayAvg)}</span>
                <span>近 3 月 {formatPercent(item.quarterAvg)}</span>
              </div>
              <p>{item.topFunds?.[0]?.name || "公开排行样本"} · 前 30 只同类基金样本，按近 1 月表现排序</p>
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

function FundOnlyPage({ topics, state, onBack }) {
  const [rankMode, setRankMode] = useState("change");
  const [selectedTopicCode, setSelectedTopicCode] = useState(null);
  const [topicDetail, setTopicDetail] = useState(null);
  const [topicDetailState, setTopicDetailState] = useState("idle");
  const sorted = [...topics].sort((a, b) => (
    rankMode === "hot" ? (b.strength || 0) - (a.strength || 0) : (b.dayChange || 0) - (a.dayChange || 0)
  ));
  const updated = new Date().toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  useEffect(() => {
    if (!selectedTopicCode && sorted[0]?.code) {
      setSelectedTopicCode(sorted[0].code);
    }
  }, [selectedTopicCode, sorted]);

  useEffect(() => {
    if (!selectedTopicCode) return undefined;
    let cancelled = false;
    setTopicDetailState("loading");
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
    return () => {
      cancelled = true;
    };
  }, [selectedTopicCode]);

  return (
    <section className="fund-only-page">
      <div className="fund-only-top">
        <strong>基金主题</strong>
        <span>东方财富公开主题数据</span>
      </div>
      <div className="fund-only-title">
        <div>
          <h1>基金主题细分榜</h1>
          <p>更新于 {updated}，按主题强度或实时涨跌排序。</p>
        </div>
        <StrengthExplainer topic={topicDetail?.topic || sorted.find((item) => item.code === selectedTopicCode) || sorted[0]} />
      </div>
      <div className="fund-rank-tabs" aria-label="基金榜单排序">
        <button className={rankMode === "change" ? "active" : ""} onClick={() => setRankMode("change")}>涨幅榜</button>
        <button className={rankMode === "hot" ? "active" : ""} onClick={() => setRankMode("hot")}>主题强度</button>
      </div>
      <TopicDetailPanel detail={topicDetail} state={topicDetailState} />
      <div className="fund-rank-card">
        <div className="fund-rank-head">
          <span>排名</span>
          <span>主题名称</span>
          <span>当日涨跌</span>
          <span>主题强度</span>
          <span>近 1 月</span>
        </div>
        {state === "live" && sorted.map((item, index) => (
          <button
            type="button"
            className={`fund-rank-row ${selectedTopicCode === item.code ? "selected" : ""}`}
            key={item.code}
            onClick={() => setSelectedTopicCode(item.code)}
          >
            <span className={index < 3 ? "hot-rank" : ""}>{String(index + 1).padStart(2, "0")}</span>
            <strong>{item.name}</strong>
            <em className={(item.dayChange || 0) >= 0 ? "up" : "down"}>{formatPercent(item.dayChange)}</em>
            <b>{Number.isFinite(item.strength) ? item.strength.toFixed(1) : "--"}</b>
            <span>{formatPercent(item.month)}</span>
          </button>
        ))}
        {state !== "live" && (
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

function IntradayLineChart({ points }) {
  const safePoints = points?.length ? points : [];
  if (!safePoints.length) {
    return <div className="intraday-empty">暂无可用分时走势</div>;
  }
  const width = 640;
  const height = 260;
  const values = safePoints.map((item) => item.change);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const pad = Math.max(0.5, (max - min) * 0.18);
  const top = max + pad;
  const bottom = min - pad;
  const xFor = (index) => 28 + (index / Math.max(1, safePoints.length - 1)) * (width - 56);
  const yFor = (value) => 24 + ((top - value) / (top - bottom)) * (height - 54);
  const line = safePoints.map((item, index) => `${xFor(index)},${yFor(item.change)}`).join(" ");
  const fill = `${line} ${width - 28},${height - 30} 28,${height - 30}`;
  const positive = safePoints.at(-1)?.change >= 0;
  return (
    <svg className="intraday-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="主题当日分时走势">
      <defs>
        <linearGradient id="intradayFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={positive ? "#d94835" : "#21965b"} stopOpacity="0.18" />
          <stop offset="1" stopColor={positive ? "#d94835" : "#21965b"} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="28" x2={width - 28} y1={yFor(0)} y2={yFor(0)} />
      <polygon points={fill} fill="url(#intradayFill)" />
      <polyline points={line} fill="none" stroke={positive ? "#d94835" : "#21965b"} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <text x="28" y="18">{top.toFixed(2)}%</text>
      <text x="28" y={height - 8}>{bottom.toFixed(2)}%</text>
      <text x="28" y={height - 32}>09:30</text>
      <text x={width / 2 - 28} y={height - 32}>11:30/13:00</text>
      <text x={width - 58} y={height - 32}>15:00</text>
    </svg>
  );
}

function TopicDetailPanel({ detail, state }) {
  const [fundSort, setFundSort] = useState("day");
  const topic = detail?.topic;
  const fundSortConfig = {
    day: { key: "dayChange", label: "日排序" },
    week: { key: "week", label: "周排序" },
    month: { key: "month", label: "月排序" },
  }[fundSort];
  const funds = [...(detail?.funds || [])].sort((a, b) => (b[fundSortConfig.key] || 0) - (a[fundSortConfig.key] || 0));
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
        <p>当日走势由主题相关持仓股票分时等权聚合，仅用于观察主题盘中方向。</p>
      </article>
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
          {funds.slice(0, 9).map((fund, index) => (
            <div className="topic-fund-row" key={fund.code}>
              <span className={index < 3 ? "hot-rank" : ""}>{String(index + 1).padStart(2, "0")}</span>
              <strong>{fund.name}</strong>
              <em className={(fund[fundSortConfig.key] || 0) >= 0 ? "up" : "down"}>{formatPercent(fund[fundSortConfig.key])}</em>
              <b>{fundSortConfig.label}</b>
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
}

function SignalRow({ signal, selected, onSelect }) {
  const Icon = signal.icon;
  const contribution = signal.score - previousScoreFor(signal);
  return (
    <button className={`signal-row ${selected ? "selected" : ""}`} onClick={onSelect}>
      <span className="signal-icon"><Icon size={18} /></span>
      <span className="signal-copy">
        <strong>{signal.name}</strong>
        <small>{signal.detail}</small>
      </span>
      <span className={`signal-pill ${toneForScore(signal.score)}`}>{signal.value}</span>
      <span className={`signal-contribution ${contribution >= 0 ? "up" : "down"}`}>
        {contribution >= 0 ? "+" : ""}{contribution}
      </span>
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

function App() {
  const [range, setRange] = useState("1D");
  const [candleRange, setCandleRange] = useState("daily");
  const [viewMode, setViewMode] = useState("market");
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
  const [fundTopicState, setFundTopicState] = useState("loading");
  const [fundTopics, setFundTopics] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetchShanghaiCompositeModel()
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
            message: "东方财富公开数据暂无可用信号",
          });
          return;
        }
        setMarketModel((current) => mergeSignalsWithSnapshot(current, payload.signals));
        setEastmoneyState({
          status: "live",
          message: `东方财富已接入 ${payload.signals.length} 个信号`,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn(error);
        setEastmoneyState({ status: "error", message: "东方财富公开数据暂不可用" });
      });
    return () => {
      cancelled = true;
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
    fetchFundCategories()
      .then((categories) => {
        if (cancelled) return;
        setFundCategories(categories);
        setFundState(categories.length ? "live" : "empty");
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn(error);
        setFundCategories([]);
        setFundState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchFundTopics()
      .then((topics) => {
        if (cancelled) return;
        setFundTopics(topics);
        setFundTopicState(topics.length ? "live" : "empty");
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn(error);
        setFundTopics([]);
        setFundTopicState("error");
      });
    return () => {
      cancelled = true;
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">M</span>
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
              <button className="date-button"><CalendarDays size={16} /> {marketModel.meta.date} <ChevronDown size={15} /></button>
            </>
          )}
        </div>
      </header>

      {viewMode === "funds" ? (
        <FundOnlyPage topics={fundTopics} state={fundTopicState} onBack={() => setViewMode("market")} />
      ) : (
        <>

      <section id="market" className="page-title">
        <div>
          <h1>上证综指情绪仪表盘</h1>
          <p>
            七个真实行情信号汇总为一个 A 股情绪读数。
            {marketModel.meta.close ? ` 最新收盘：${marketModel.meta.close.toFixed(2)}。` : ""}
          </p>
          <div className="data-badges">
            <span>真实：上证综指价格 / OHLC / K 线</span>
            <span>信号：{signals.length} 个真实数据项</span>
            <span className={`source-status ${eastmoneyState.status}`}>{eastmoneyState.message}</span>
          </div>
        </div>
        <div className="range-tabs" aria-label="时间范围">
          {ranges.map((item) => (
            <button key={item} className={range === item ? "active" : ""} onClick={() => setRange(item)}>
              {item}
            </button>
          ))}
        </div>
      </section>

      <section id="sentiment" className="dashboard-grid">
        <article className={`gauge-panel ${tone}`}>
          <div className="panel-header">
            <span>当前读数</span>
            <strong className={data.delta >= 0 ? "up" : "down"}>{data.delta >= 0 ? "+" : ""}{data.delta} 较上次</strong>
          </div>
          <GaugeDial score={data.score} label={data.label} />
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
            <span>加权组成</span>
          </div>
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
