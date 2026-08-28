import WebSocket from "ws";
import { EventEmitter } from "events";

/**
 * Connects to PumpPortal's public WebSocket API.
 * Docs: https://pumpportal.fun/data-api/real-time
 *
 * Events emitted:
 *  - "newToken"  -> { mint, name, symbol, creator, createdAt, initialBuy, marketCapSol, ... }
 *  - "trade"     -> { mint, txType: "buy"|"sell", solAmount, tokenAmount, marketCapSol, trader, ts }
 */
export class PumpFunListener extends EventEmitter {
  constructor({ reconnectDelayMs = 3000 } = {}) {
    super();
    this.url = "wss://pumpportal.fun/api/data";
    this.reconnectDelayMs = reconnectDelayMs;
    this.ws = null;
    this.watchedMints = new Set();
  }

  start() {
    this._connect();
  }

  stop() {
    this._manualClose = true;
    this.ws?.close();
  }

  _connect() {
    this.ws = new WebSocket(this.url);

    this.ws.on("open", () => {
      this._manualClose = false;
      console.log("[pumpfun-listener] connected");
      // Subscribe to the new-token launch stream
      this.ws.send(JSON.stringify({ method: "subscribeNewToken" }));
      // Re-subscribe to trade streams for any mints we were already watching
      if (this.watchedMints.size > 0) {
        this.ws.send(
          JSON.stringify({
            method: "subscribeTokenTrade",
            keys: [...this.watchedMints],
          })
        );
      }
    });

    this.ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.txType === undefined && msg.mint && msg.name) {
        // new token event
        this.emit("newToken", msg);
      } else if (msg.txType === "buy" || msg.txType === "sell") {
        this.emit("trade", msg);
      }
    });

    this.ws.on("close", () => {
      console.log("[pumpfun-listener] connection closed");
      if (!this._manualClose) {
        setTimeout(() => this._connect(), this.reconnectDelayMs);
      }
    });

    this.ws.on("error", (err) => {
      console.error("[pumpfun-listener] error:", err.message);
    });
  }

  /** Start listening to a specific mint's trade stream (called once a signal candidate is found) */
  watchToken(mint) {
    if (this.watchedMints.has(mint)) return;
    this.watchedMints.add(mint);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ method: "subscribeTokenTrade", keys: [mint] }));
    }
  }

  /** Drop a mint we no longer care about (filtered out or position closed) */
  unwatchToken(mint) {
    if (!this.watchedMints.has(mint)) return;
    this.watchedMints.delete(mint);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ method: "unsubscribeTokenTrade", keys: [mint] }));
    }
  }
}
