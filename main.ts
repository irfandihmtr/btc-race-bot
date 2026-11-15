// V-Bounce + Breakout: a two-leg swing bot for cbBTC/USDC, long only.
//
// The dev window (1,440 one-minute bars) is a grind down: BTC -4.00% with one
// big V (hour 16 -2.04% to the trough, hours 17-18 +2.84% / +1.05% back up).
// Every kit baseline fails the dev gate on it (buy-and-hold -44.01, momentum
// -40.92, ema-cross -134.95, rsi-bollinger -57.37, adx-momentum -86.60 USDC),
// because trend-following whipsaws and holding through the fall both bleed.
// A full-size round trip costs ~26 bps (4 bps fee + 2 bps slippage + price
// impact), so the bot only trades moves it can clear with room to spare, and
// it sits in cash the rest of the day.
//
// Two legs share the single position slot, so the bot can profit in either
// regime instead of betting the whole race on one direction:
//
//   DIP (mean reversion): buy a sharp 30-minute drop that is also below its
//   60-bar EMA, i.e. a capitulation dip, not a drift. Exit on a +1.6% take
//   profit, a -1.2% stop, a 120-bar time stop, or a 0.8% trailing stop once
//   the trade is +1% up. The time stop matters: without it the second dip
//   trade of the dev day rides the drift down to its stop instead of
//   banking +0.65% at the stop.
//
//   BREAKOUT (momentum): buy a close at/above the trailing 60-bar high with
//   a +0.6% 30-minute return behind it, i.e. the recovery leg confirming
//   rather than a dead-cat tick. Exit on a +2.0% take profit, a 0.8%
//   trailing stop, or a -1.0% stop.
//
// No new entries in the final 30 scored bars: a trade opened there cannot
// develop before the forced flatten at the last close, it only pays the
// round trip. Both windows are 1,440 bars (RULES, Windows), so the cutoff
// is bar 1410 of the scored window.
//
// Everything is deterministic float64 on the bars themselves: no clock, no
// environment, no randomness. Entry prices come from the harness's own fill
// reports, so take-profit / stop levels are measured from the price actually
// paid, not the decision close.

import { runBars, type BarsState, type Batch, type BuyInput, type OrderInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// Dip leg: 30-bar return at or below -1.6%, close below EMA(60) x 0.995.
const DIP_DROP = 0.016;
const DIP_BELOW_EMA = 0.995;
const DIP_TP = 0.016;
const DIP_SL = 0.012;
const DIP_TIME_STOP = 120;
const DIP_TRAIL = 0.008;
const DIP_TRAIL_ARM = 0.01;
// Breakout leg: close at/above the 60-bar high, 30-bar return at least +0.6%.
const BRK_LOOKBACK = 60;
const BRK_MOM = 0.006;
const BRK_TP = 0.02;
const BRK_TRAIL = 0.008;
const BRK_SL = 0.01;
// EMA span for the dip filter.
const EMA_SPAN = 60;
// History needed before either leg may fire.
const MIN_BARS = 60;
// No new entries once this many scored bars have passed (windows are 1440).
const ENTRY_CUTOFF = 1410;
// Slippage cap, 1% past the close the order was decided on.
const MAX_SLIPPAGE_BPS = 100;

/** Closes and highs in USDC, one entry per bar the symbol actually printed. */
const closes: number[] = [];
const highs: number[] = [];
/** EMA(60) state: seeded as the mean of the first 60 closes, like the baselines. */
let emaValue: number | null = null;
/** The open trade, set from the harness's fill report (price actually paid). */
let entryPrice: number | null = null;
let entrySeq = -1;
let entryKind: 'dip' | 'brk' | null = null;
/** Highest high since the fill bar, for the trailing stops. */
let peakHigh = 0;

function pushBar(bar: { c: string; h: string }): void {
  const c = Number(BigInt(bar.c)) / 1e5;
  const h = Number(BigInt(bar.h)) / 1e5;
  closes.push(c);
  highs.push(h);
  if (emaValue !== null) {
    emaValue += (2 / (EMA_SPAN + 1)) * (c - emaValue);
  } else if (closes.length === EMA_SPAN) {
    emaValue = closes.reduce((a, x) => a + x, 0) / EMA_SPAN;
  }
}

function ret30(i: number): number {
  return closes[i] / closes[i - 30] - 1;
}

await runBars({
  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const held = state.positions.get(SYMBOL);
    // Lock in the price paid. Prefer the harness's fill report; if a sell
    // was rejected last batch the entry was already cleared, so fall back to
    // the position's cost basis (fees included) instead of getting stuck flat
    // while still holding. Without this a rejected sell would leave the bot
    // sending a fresh buy every bar while holding, which the harness rejects.
    if (held !== undefined && entryPrice === null) {
      const fill = batch.fills.find((f) => f.side === 'buy' && f.status === 'filled');
      if (fill !== undefined) {
        entryPrice = Number(BigInt(fill.price)) / 1e5;
        entrySeq = batch.seq;
        peakHigh = Number(BigInt(bar.h)) / 1e5;
      } else {
        // cost_quote_units / qty, back to a price: price_raw =
        // cost * 10^(qty_scale + price_scale) / (qty * 10^quote_scale).
        const cost = BigInt(held.cost);
        const qty = BigInt(held.qty);
        if (qty > 0n) {
          const priceRaw = (cost * 10n ** 13n) / (qty * 10n ** 6n);
          entryPrice = Number(priceRaw) / 1e5;
          entrySeq = batch.seq;
          peakHigh = Number(BigInt(bar.h)) / 1e5;
          if (entryKind === null) entryKind = 'dip';
        }
      }
    }
    pushBar(bar);
    const i = closes.length - 1;
    const close = closes[i];
    const scored = batch.seq - state.warmupBars;

    if (held !== undefined && entryPrice !== null && entryKind !== null) {
      if (Number(BigInt(bar.h)) / 1e5 > peakHigh) peakHigh = Number(BigInt(bar.h)) / 1e5;
      const entry = entryPrice;
      if (entryKind === 'dip') {
        if (
          close >= entry * (1 + DIP_TP) ||
          close <= entry * (1 - DIP_SL) ||
          (close >= entry * (1 + DIP_TRAIL_ARM) && close <= peakHigh * (1 - DIP_TRAIL)) ||
          batch.seq - entrySeq >= DIP_TIME_STOP
        ) {
          const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS, client_id: `s${batch.seq}` };
          entryPrice = null;
          entryKind = null;
          return [sell];
        }
      } else {
        if (
          close >= entry * (1 + BRK_TP) ||
          close <= peakHigh * (1 - BRK_TRAIL) ||
          close <= entry * (1 - BRK_SL)
        ) {
          const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS, client_id: `s${batch.seq}` };
          entryPrice = null;
          entryKind = null;
          return [sell];
        }
      }
      return [];
    }

    // Flat: consider an entry. A buy rejected last batch leaves us flat, so a
    // still-valid signal is simply re-evaluated here on the next bar.
    if (held !== undefined) return [];
    if (state.warmingUp || i < MIN_BARS || scored >= ENTRY_CUTOFF) return [];
    if (state.cash <= 0n) return [];
    let kind: 'dip' | 'brk' | null = null;
    if (emaValue !== null && ret30(i) <= -DIP_DROP && close < emaValue * DIP_BELOW_EMA) {
      kind = 'dip';
    } else {
      let high60 = 0;
      for (let j = i - BRK_LOOKBACK; j < i; j++) if (highs[j] > high60) high60 = highs[j];
      if (close >= high60 && ret30(i) >= BRK_MOM) kind = 'brk';
    }
    if (kind === null) return [];
    entryKind = kind;
    const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS, client_id: `b${batch.seq}` };
    return [buy];
  },
});
