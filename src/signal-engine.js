import { EventEmitter } from "events";

/**
 * Keeps live stats for each token and computes an "entry score" (0-100).
 * Once the score crosses the threshold it emits a "signal" event — the
 * execution layer will listen for this and decide whether to buy.
 *
 * Signals used (each with a tunable weight):
 *  1) Volume velocity     -> how much SOL traded in the first N seconds
 *  2) Buy/sell ratio      -> buy count / (buy+sell) count, higher is better
 *  3) Unique buyer count  -> organic-interest indicator (filters out tokens
 *                             being pumped by a single wallet)
 *  4) Market cap momentum -> how fast marketCapSol is rising over time
 */
export class SignalEngine extends EventEmitter {
  constructor({
    windowMs = 45_000,       // how long to watch each token before evaluating
    minTrades = 5,           // minimum trades seen before scoring
    scoreThreshold = 70,     // emit "signal" above this score
    weights = { volume: 0.3, buyRatio: 0.25, uniqueBuyers: 0.25, momentum: 0.2 },
  } = {}) {
    super();
    this.windowMs = windowMs;
    this.minTrades = minTrades;
    this.scoreThreshold = scoreThreshold;
    this.weights = weights;
    this.tokens = new Map(); // mint -> stats
  }

  registerNewToken(tokenMsg) {
    const { mint, name, symbol, createdAt } = tokenMsg;
    if (this.tokens.has(mint)) return;

    this.tokens.set(mint, {
      mint,
      name,
      symbol,
      createdAt: createdAt ?? Date.now(),
      trades: [],
      buyers: new Set(),
      sellers: new Set(),
      solVolume: 0,
      marketCapHistory: [], // { ts, marketCapSol }
      signaled: false,
      finalized: false,
    });

    // stop evaluating this token once the watch window closes
    setTimeout(() => this._finalize(mint), this.windowMs);
  }

  registerTrade(tradeMsg) {
    const { mint, txType, solAmount, trader, marketCapSol } = tradeMsg;
    const t = this.tokens.get(mint);
    if (!t || t.finalized) return;

    t.trades.push({ txType, solAmount, ts: Date.now() });
    t.solVolume += solAmount ?? 0;
    if (txType === "buy") t.buyers.add(trader);
    if (txType === "sell") t.sellers.add(trader);
    if (marketCapSol != null) t.marketCapHistory.push({ ts: Date.now(), marketCapSol });

    if (!t.signaled && t.trades.length >= this.minTrades) {
      const score = this._score(t);
      if (score >= this.scoreThreshold) {
        t.signaled = true;
        this.emit("signal", {
          mint: t.mint,
          name: t.name,
          symbol: t.symbol,
          score,
          solVolume: t.solVolume,
          uniqueBuyers: t.buyers.size,
          ageMs: Date.now() - t.createdAt,
        });
      }
    }
  }

  _score(t) {
    const buyCount = t.trades.filter((x) => x.txType === "buy").length;
    const sellCount = t.trades.filter((x) => x.txType === "sell").length;

    // 1) volume velocity: simple normalization, saturates at 5 SOL
    const volumeScore = Math.min(100, (t.solVolume / 5) * 100);

    // 2) buy/sell ratio
    const buyRatioScore =
      buyCount + sellCount === 0 ? 0 : (buyCount / (buyCount + sellCount)) * 100;

    // 3) unique buyer count: saturates at 10 distinct wallets
    const uniqueBuyerScore = Math.min(100, (t.buyers.size / 10) * 100);

    // 4) market cap momentum: % growth between first and last reading, saturates at 3x
    let momentumScore = 0;
    if (t.marketCapHistory.length >= 2) {
      const first = t.marketCapHistory[0].marketCapSol;
      const last = t.marketCapHistory[t.marketCapHistory.length - 1].marketCapSol;
      if (first > 0) {
        const growth = (last - first) / first; // 0.0 - N
        momentumScore = Math.min(100, (growth / 2) * 100); // saturates at 2x growth
      }
    }

    const w = this.weights;
    const total =
      volumeScore * w.volume +
      buyRatioScore * w.buyRatio +
      uniqueBuyerScore * w.uniqueBuyers +
      momentumScore * w.momentum;

    return Math.round(total);
  }

  _finalize(mint) {
    const t = this.tokens.get(mint);
    if (!t) return;
    t.finalized = true;
    // Avoid unbounded memory growth: fully drop tokens that never signaled
    setTimeout(() => this.tokens.delete(mint), 5 * 60_000);
  }
}
