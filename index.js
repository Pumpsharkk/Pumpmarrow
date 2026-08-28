import "dotenv/config";
import { PumpFunListener } from "./pumpfun-listener.js";
import { SignalEngine } from "./signal-engine.js";
import { initLogger, logSignal } from "./logger.js";
import { startKeepAliveServer } from "./keepalive.js";

initLogger();
startKeepAliveServer();

const listener = new PumpFunListener();
const engine = new SignalEngine({
  windowMs: 45_000,      // watch each token for its first 45 seconds
  minTrades: 5,          // don't score before at least 5 trades are seen
  scoreThreshold: 70,    // 70+ score -> signal
});

listener.on("newToken", (tokenMsg) => {
  engine.registerNewToken(tokenMsg);
  // start listening to this mint's trade stream
  listener.watchToken(tokenMsg.mint);
  console.log(`[newToken] ${tokenMsg.symbol ?? "?"} — ${tokenMsg.mint}`);
});

listener.on("trade", (tradeMsg) => {
  engine.registerTrade(tradeMsg);
});

engine.on("signal", async (signal) => {
  await logSignal(signal);

  // --- THIS IS WHERE THE EXECUTION LAYER WILL PLUG IN ---
  // In the next step we'll add the wallet/trade execution module here.
  // e.g.: await executeBuy(signal.mint, { solAmount: 0.1, maxSlippagePct: 15 });

  // Once a signal fires we no longer need to track this token's trade stream
  // (the execution layer will own its own position tracking)
  listener.unwatchToken(signal.mint);
});

listener.start();
console.log("Pump.fun signal engine running...");
