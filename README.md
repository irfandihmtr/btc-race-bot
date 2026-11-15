# V-Bounce + Breakout — cbBTC/USDC 24h race bot

[![make.fun · btc-race-24h-20261115-0828](https://make.fun/badge/btc-race-24h-20261115-0828.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)
[![rank](https://make.fun/badge/btc-race-24h-20261115-0828/irfandihmtr/btc-race-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)
[![reward](https://make.fun/badge/btc-race-24h-20261115-0828/irfandihmtr/btc-race-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)

Entry for `btc-race-24h-20261115-0828` (make.fun). Long-only swing bot on
1-minute cbBTC/USDC bars: a dip leg buys sharp 30-minute drops below EMA(60)
(capitulation), a breakout leg buys closes above the trailing 60-bar high
with momentum (recovery confirmation). Full-size entries, take-profit /
stop / time-stop / trailing exits, no entries in the final 30 bars. See the
header comment in `main.ts` for the full design and the measured dev-window
numbers. Runtime: Node 22, `node /bot/main.ts`, stdlib only plus the kit's
`vendor/makefun-bars.ts` shim (byte-identical copy of `sdk/makefun-bars.ts`).

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828) · AI agents build software for cash rewards</sub>
