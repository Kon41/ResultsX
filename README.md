# CBSE Class 10 Second Board — Result Watch (PWA)

A static, installable PWA that tracks the expected CBSE Class 10 Second Board Exam result date and can alarm/notify you. No backend, no tracking — everything lives in `data.json`, which you edit and commit whenever there's real news.

## Why the date isn't "confirmed" yet
As of the last update in this project, CBSE has **not** issued a written notice with an exact result date. The only on-record information is:
- CBSE's Controller of Examinations stating (in a public webinar) that the board was targeting **30 June 2026**.
- CBSE's own circular on the two-exam system, which only commits to **"the month of June."**

Because that window has already passed without a confirmed date, `data.json` reflects an honest "not yet declared" status rather than guessing. Treat every date in this app as an estimate until CBSE itself confirms it — see `officialSources` in `data.json`.

## Deploying on GitHub Pages
1. Create a new GitHub repo (e.g. `cbse-result-watch`) and push all files in this folder to it.
2. In the repo: **Settings → Pages → Source → Deploy from branch → `main` / root**.
3. Your app will be live at `https://<your-username>.github.io/<repo-name>/`.
4. Open that URL on your phone and use "Add to Home Screen" (Android/Chrome) or "Add to Home Screen" from the Share sheet (iOS/Safari) to install it as an app.

## Keeping the information accurate
Only edit `data.json` — never guess in the HTML/JS.

- **When CBSE announces an official date:** set `"resultDeclared": true` (once the result is actually out) or update `expectedResultWindow` with the confirmed date and set `officialResultDate`.
- **Every time you check the official site:** update `"lastChecked"` to today's date, even if nothing changed. This keeps the "last verified" line honest.
- Only add entries to `officialSources` and `statements` that come from `cbse.gov.in`, `cbseresults.nic.in`, DigiLocker, UMANG, or an on-record CBSE official statement. Don't add coaching-institute or news-aggregator blogs — they're useful for humans browsing the web, but this app is meant to only reflect the board's own word.

## Fully automatic — no manual "ring" button
There is deliberately no button that fakes an alert. Two things run entirely on their own:

1. **`.github/workflows/check-status.yml`** — a GitHub Actions job scheduled every 3 hours (`0 */3 * * *`, 8 times a day), handled free by GitHub. It runs `scripts/check_news.py`, which:
   - Queries Google News' public search feed for CBSE Class 10 second-board-result coverage.
   - Keeps only headlines from an allowlist of established news organisations (see `TRUSTED_PUBLISHERS` in the script — edit this list to add/remove outlets you trust).
   - If a trusted outlet's headline matches a "result declared/out/released" pattern, it sets `newsSignal.detected = true` in `data.json` along with the publisher name, link, and timestamp — then commits and pushes that change automatically.
   - This is a **heads-up signal**, clearly separated from `resultDeclared`. `resultDeclared` should only ever be set to `true` once CBSE itself has confirmed it.

2. **The app itself** re-fetches `data.json` every 5 minutes (and every time you reopen it). The moment it sees either `resultDeclared: true` or a new `newsSignal.detected`, it automatically rings (looping tone + vibration), shows a full-screen alert, and fires a system notification — with a link straight to the report or the official result-check sites. You don't press anything to make this happen.

The only tap ever required is the one-time **"Enable notifications"** button — browsers require an actual user gesture to grant that permission; it's a permission grant, not a way of manually triggering an alert.

### Enabling the schedule
GitHub Actions schedules only run on the **default branch** of a repo that has had at least one push, and only while the repo isn't archived. After your first push to `main`, the workflow starts firing on its own — check the "Actions" tab of your repo to confirm runs are happening and see their logs (including "MATCH" lines if something was found).

## Limits to be aware of
- Google News' feed can occasionally mis-title or delay a story; the trusted-publisher allowlist and keyword pattern in `scripts/check_news.py` cut down false positives but won't be perfect. Treat the news signal as "go check now," not as proof.
- A pure static site cannot receive an instant push the moment CBSE's own site updates — that would need a server watching `cbseresults.nic.in` directly. The 3-hour Actions schedule is the practical equivalent within a free, static-hosting-only setup.
- If you want faster/more precise official-source checks, you can extend `scripts/check_news.py` to also fetch `cbse.gov.in`'s notifications page directly — GitHub Actions runs on its own servers, so it isn't blocked by the browser CORS rules that would stop client-side JS from doing the same thing.
