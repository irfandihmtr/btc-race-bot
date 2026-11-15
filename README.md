# V-Bounce + Breakout — cbBTC/USDC 24h race bot

Entry for `btc-race-24h-20261115-0828` (make.fun). Long-only swing bot on
1-minute cbBTC/USDC bars: a dip leg buys sharp 30-minute drops below EMA(60)
(capitulation), a breakout leg buys closes above the trailing 60-bar high
with momentum (recovery confirmation). Full-size entries, take-profit /
stop / time-stop / trailing exits, no entries in the final 30 bars. See the
header comment in `main.ts` for the full design and the measured dev-window
numbers. Runtime: Node 22, `node /bot/main.ts`, stdlib only plus the kit's
`vendor/makefun-bars.ts` shim (byte-identical copy of `sdk/makefun-bars.ts`).
