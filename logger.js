import { createClient } from "@supabase/supabase-js";

let supabase = null;

export function initLogger() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.log("[logger] SUPABASE_URL / SUPABASE_SERVICE_KEY not set — logging to console only");
    return;
  }
  supabase = createClient(url, key);
  console.log("[logger] Supabase connection ready");
}

/**
 * Expected table schema (create this in the Supabase SQL editor):
 *
 * create table signals (
 *   id uuid primary key default gen_random_uuid(),
 *   mint text not null,
 *   name text,
 *   symbol text,
 *   score int not null,
 *   sol_volume numeric,
 *   unique_buyers int,
 *   age_ms int,
 *   created_at timestamptz default now()
 * );
 */
export async function logSignal(signal) {
  console.log(
    `[SIGNAL] ${signal.symbol ?? "?"} (${signal.mint.slice(0, 8)}...) score=${signal.score} ` +
      `volume=${signal.solVolume.toFixed(2)} SOL buyers=${signal.uniqueBuyers} age=${Math.round(
        signal.ageMs / 1000
      )}s`
  );

  if (!supabase) return;
  const { error } = await supabase.from("signals").insert({
    mint: signal.mint,
    name: signal.name,
    symbol: signal.symbol,
    score: signal.score,
    sol_volume: signal.solVolume,
    unique_buyers: signal.uniqueBuyers,
    age_ms: signal.ageMs,
  });
  if (error) console.error("[logger] Supabase insert error:", error.message);
}
