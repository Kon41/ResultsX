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

## How the alarm works
- You set a date/time in the app; it's stored only on your device (`localStorage`).
- While the app/tab is open, a timer checks every 20 seconds — if the time has passed, it rings (sound + vibration + full-screen alert) and fires a system notification.
- The app also re-fetches `data.json` every 5 minutes (and whenever you reopen the app) so that if you flip `resultDeclared` to `true` after pushing an update, your phone will alert you the next time it checks.
- On Android, if you install the app to your home screen, Chrome *may* run a best-effort background check via Periodic Background Sync — this isn't guaranteed by any browser and depends on your usage patterns, battery settings, and OS. It is **not** a substitute for opening the app around the expected dates.

## Limits of a static/no-server PWA (be aware)
A pure static site cannot receive a "push" the instant CBSE declares the result — that would require a server sending Web Push. This app instead relies on:
1. A **self-set alarm** for a date you choose (reliable while the app is open).
2. **You editing `data.json`** the moment you personally confirm the result is out, so the next time the app is opened/checked it alerts you immediately.

If you want true "the moment it's out" push alerts with no manual step, that needs a small backend (e.g. a scheduled function polling `cbseresults.nic.in` and sending a Web Push) — outside the scope of a GitHub Pages–only static site.
