#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# Ramping load test for the DEPLOYED app (free Render + Supabase free).
# Steps concurrency 50 -> 100 -> 200 -> 400 and prints a response-time curve so
# you can SEE where latency climbs / errors start — that's your real ceiling.
#
# Run from YOUR OWN computer (not here):   bash loadtest.sh
# Needs Node installed. autocannon is fetched on the fly via npx (no install).
#
# Optional overrides:
#   BASE=https://your-app.onrender.com  STUDENT_ID=123  ACCESS_CODE=ABC \
#   LEVELS="50 100 200 400"  DURATION=20  bash loadtest.sh
# ------------------------------------------------------------------------------
set -u

BASE="${BASE:-https://coursel-31wj.onrender.com}"
LEVELS="${LEVELS:-50 100 200 400}"   # concurrency steps to ramp through
DURATION="${DURATION:-20}"           # seconds per step
COOLDOWN="${COOLDOWN:-8}"            # seconds between steps (let the box recover)
POLL_SECONDS=30                      # student page refreshes every 30s (see student.js)

# Fill these in (or pass as env vars) to test the REAL student dashboard —
# the heaviest student-side query. Leave as-is to test the light /api/colleges.
STUDENT_ID="${STUDENT_ID:-PUT_A_REAL_STUDENT_ID_HERE}"
ACCESS_CODE="${ACCESS_CODE:-PUT_YOUR_COLLEGE_CODE_HERE}"

if [ "$STUDENT_ID" != "PUT_A_REAL_STUDENT_ID_HERE" ]; then
  URL="$BASE/api/student/$STUDENT_ID/dashboard?code=$ACCESS_CODE"
  WHAT="REAL student dashboard (full student-side load)"
else
  URL="$BASE/api/colleges"
  WHAT="/api/colleges (light DB read — set STUDENT_ID & ACCESS_CODE for the real test)"
fi

echo "============================================================================"
echo " Ramping load test"
echo "   Target : $URL"
echo "   Testing: $WHAT"
echo "   Steps  : $LEVELS concurrent  |  ${DURATION}s each  |  poll interval ${POLL_SECONDS}s"
echo "============================================================================"
echo
echo "==> Waking the free instance (it sleeps when idle)…"
curl -s -o /dev/null -w "   /api/meta -> HTTP %{http_code} in %{time_total}s\n" "$BASE/api/meta"
sleep 3
echo

printf "%-6s | %-8s | %-9s | %-9s | %-9s | %-7s | %-7s | %s\n" \
  "conc" "req/s" "p50 ms" "p97.5 ms" "p99 ms" "errors" "non2xx" "verdict / est. students"
printf -- "-------+----------+-----------+-----------+-----------+---------+---------+------------------------\n"

for C in $LEVELS; do
  OUT="/tmp/ac_${C}.json"
  npx -y autocannon -c "$C" -d "$DURATION" -j "$URL" > "$OUT" 2>/dev/null
  node -e '
    const fs = require("fs");
    const C = Number(process.argv[1]), poll = Number(process.argv[2]);
    let r; try { r = JSON.parse(fs.readFileSync(process.argv[3], "utf8")); }
    catch (e) { console.log(String(C).padEnd(6) + " |  (no result — connection refused / instance down)"); process.exit(0); }
    const reqs = r.requests?.average ?? 0;
    const p50 = r.latency?.p50 ?? 0, p975 = r.latency?.p97_5 ?? 0, p99 = r.latency?.p99 ?? 0;
    const errs = (r.errors ?? 0) + (r.timeouts ?? 0);
    const non2xx = r.non2xx ?? 0;
    // Each open student page = ~1 refresh / poll seconds. Sustained req/s * poll = concurrent students served.
    const est = Math.round(reqs * poll);
    let verdict;
    if (errs > 0 || non2xx > 0) verdict = "❌ failing";
    else if (p975 > 2000) verdict = "🔴 overloaded";
    else if (p975 > 1000) verdict = "🟠 strained";
    else verdict = "🟢 healthy · ~" + est.toLocaleString() + " students";
    const f = (n) => Number(n).toFixed(n >= 100 ? 0 : 1);
    console.log(
      String(C).padEnd(6) + " | " +
      String(f(reqs)).padEnd(8) + " | " +
      String(f(p50)).padEnd(9) + " | " +
      String(f(p975)).padEnd(9) + " | " +
      String(f(p99)).padEnd(9) + " | " +
      String(errs).padEnd(7) + " | " +
      String(non2xx).padEnd(7) + " | " + verdict
    );
  ' "$C" "$POLL_SECONDS" "$OUT"
  sleep "$COOLDOWN"
done

echo
echo "----------------------------------------------------------------------------"
echo "HOW TO READ THIS:"
echo "  • req/s     = sustained requests the app served per second at that load."
echo "  • p97.5 ms  = tail latency — 97.5% of requests were faster than this."
echo "                Under ~1000ms feels instant; over ~2000ms feels broken."
echo "  • errors / non2xx should be 0. Anything above 0 = you hit the ceiling."
echo "  • est. students ≈ req/s × ${POLL_SECONDS} (each page refreshes every ${POLL_SECONDS}s)."
echo
echo "Your CEILING is the last row that is still 🟢 healthy. The first row that turns"
echo "🟠/🔴/❌ is where free-tier Render/Supabase runs out of headroom."
echo "----------------------------------------------------------------------------"
