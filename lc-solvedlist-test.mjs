// Does GraphQL return a user's FULL solved list? Test it with ground truth.
// Run on YOUR machine (it reaches leetcode.com).
//
//   1) Logged OUT (no cookie):
//        node lc-solvedlist-test.mjs
//      -> "solved (status=ac): 0"  proves status needs a session.
//
//   2) Logged IN as a student (paste that student's cookie):
//        LEETCODE_SESSION="<their LEETCODE_SESSION cookie value>" node lc-solvedlist-test.mjs
//      -> "solved (status=ac): 295"  proves it returns the FULL list for that session.
//
// How to get the cookie: log in to leetcode.com in Chrome -> DevTools (F12) ->
// Application tab -> Cookies -> https://leetcode.com -> copy the value of LEETCODE_SESSION.

const SESSION = process.env.LEETCODE_SESSION || '';

const QUERY = `query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
  problemsetQuestionList: questionList(categorySlug: $categorySlug, limit: $limit, skip: $skip, filters: $filters) {
    total: totalNum
    questions: data { titleSlug status }
  }
}`;

async function page(skip, limit) {
  const headers = { 'Content-Type': 'application/json', Referer: 'https://leetcode.com/problemset/all/', 'User-Agent': 'Mozilla/5.0' };
  if (SESSION) headers.Cookie = `LEETCODE_SESSION=${SESSION}`;
  const r = await fetch('https://leetcode.com/graphql', {
    method: 'POST', headers,
    body: JSON.stringify({ query: QUERY, variables: { categorySlug: '', skip, limit, filters: {} } }),
  });
  const j = await r.json();
  return j?.data?.problemsetQuestionList || null;
}

(async () => {
  console.log(SESSION ? '\nUsing a LEETCODE_SESSION cookie (authenticated).\n' : '\nNo cookie set (logged out).\n');
  const first = await page(0, 1);
  if (!first) { console.log('ERROR: no data (blocked or query rejected).'); return; }
  const total = first.total;
  console.log('Total problems on LeetCode:', total);

  let solved = 0, seen = 0;
  const LIMIT = 100;
  for (let skip = 0; skip < total; skip += LIMIT) {
    const p = await page(skip, LIMIT);
    if (!p) break;
    for (const q of p.questions) { seen++; if (q.status === 'ac') solved++; }
    process.stdout.write(`\r  scanned ${seen}/${total} ... solved so far: ${solved}`);
    await new Promise((r) => setTimeout(r, 400)); // be polite
  }
  console.log(`\n\nRESULT -> solved (status=ac): ${solved} of ${seen} scanned`);
  console.log(SESSION
    ? 'If this ~matches the profile\'s total, GraphQL gives the full list — but only for THIS logged-in account.\n'
    : 'Zero solved while logged out = the full list needs that user\'s own session. Re-run with LEETCODE_SESSION set.\n');
})();
