// Ground-truth test: how deep does LeetCode's recentAcSubmissionList actually go?
// Run on YOUR machine (it can reach leetcode.com):
//   node lc-history-test.mjs <leetcode-username-or-profile-url> [optional-question-slug]
//
// Examples:
//   node lc-history-test.mjs Tamilarasan_Guna
//   node lc-history-test.mjs https://leetcode.com/u/Tamilarasan_Guna/ two-sum
//
// What it tells you:
//   • If "returned" stays ~15-20 even when we ask for 100/250 -> LeetCode CAPS it,
//     and NO scraper (including the Chrome extension) can see older solves. Period.
//   • If "returned" grows with the limit -> raising LC_RECENT_LIMIT genuinely helps,
//     and the problem is elsewhere (sync not run, or a slug mismatch).

function parseUsername(input) {
  let s = String(input || '').trim();
  const m = s.match(/leetcode\.com\/(?:u\/)?([^/?#]+)/i);
  return (m ? m[1] : s).replace(/[/?#].*$/, '').trim();
}

const raw = process.argv[2];
const wantedSlug = (process.argv[3] || '').toLowerCase().replace(/.*problems\//, '').replace(/\/.*/, '') || null;
if (!raw) { console.error('Usage: node lc-history-test.mjs <username-or-url> [question-slug]'); process.exit(1); }
const username = parseUsername(raw);

const QUERY = `query($u:String!,$l:Int!){recentAcSubmissionList(username:$u,limit:$l){title titleSlug timestamp}}`;

async function pull(limit) {
  const r = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({ query: QUERY, variables: { u: username, l: limit } }),
  });
  const j = await r.json();
  return j?.data?.recentAcSubmissionList || null;
}

console.log(`\nProfile: ${username}\n`);
console.log('requested | returned | oldest solve | newest solve');
console.log('----------+----------+--------------+-------------');
let deepest = [];
for (const limit of [20, 40, 100, 250]) {
  try {
    const list = await pull(limit);
    if (!list) { console.log(String(limit).padEnd(9) + ' |  (error / private profile / rate-limited)'); continue; }
    if (list.length > deepest.length) deepest = list;
    const ts = list.map((x) => Number(x.timestamp)).filter(Boolean);
    const d = (t) => new Date(t * 1000).toISOString().slice(0, 10);
    const oldest = ts.length ? d(Math.min(...ts)) : '-';
    const newest = ts.length ? d(Math.max(...ts)) : '-';
    console.log(String(limit).padEnd(9) + ' | ' + String(list.length).padEnd(8) + ' | ' + oldest.padEnd(12) + ' | ' + newest);
    await new Promise((r) => setTimeout(r, 600)); // be polite
  } catch (e) {
    console.log(String(limit).padEnd(9) + ' |  network error: ' + e.message);
  }
}

if (wantedSlug) {
  const hit = deepest.find((s) => s.titleSlug.toLowerCase() === wantedSlug);
  console.log(`\nIs "${wantedSlug}" in this profile's recent accepted list?  ${hit ? 'YES ✅ (solved ' + new Date(hit.timestamp * 1000).toISOString().slice(0,10) + ')' : 'NO ❌ (not within the window LeetCode returns)'}`);
}
console.log('\nRead it: if "returned" never exceeds ~15-20, that\'s LeetCode\'s hard cap.\n');
