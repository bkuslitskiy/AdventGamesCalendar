# Advent

Seven puzzles a day (Wend, Pinpoint, Crossclimb, Connections, Mini, Wordle and Hashtag), Dec 1–31 2026, at advent.useless.blog. Each day opens at midnight New York time. One real player (babe) writes progress to the server; anyone else plays in their own browser.

## Stack

- **Frontend:** TypeScript, no framework, no bundler. `tsc` compiles `src/` to plain ES modules in `public/js/`.
- **API:** Cloudflare Pages Functions in `functions/api/`, sharing `src/core/` with the browser.
- **Storage:** one D1 table, `events`. It's an append-only log, and progress is rebuilt by replaying it.
- **Content:** JSON files in `content/days/NN/`, bundled into the Function at build time. They're never static assets, so a day's puzzles are only served once it opens.
- **AI:** a Workers AI binding (`AI`) gives Pinpoint a second opinion on rejected guesses. There's no API key, and on the Workers Free plan usage past the daily free allocation fails instead of billing.
- **Dependencies:** TypeScript (dev) and nothing else.

```text
src/core/        shared rules: time + lateness, Wend, Pinpoint matcher, Crossclimb, Connections, Mini, Wordle, Hashtag, replay, calendar status
src/web/         the app: views/, games/ (+ the on-screen keyboard), store (babe/guest/preview), api client
src/index.html   page template; `npm run build` writes public/index.html from it (per-build asset URLs)
functions/api/   state, day/[n], progress, events, judge, admin/{log,void,reset}
server/          D1 access, content lookup, http helpers, AI judge (content.generated.ts is built)
content/days/    01/ … 31/  →  wend.json  pinpoint.json  crossclimb.json  connections.json  mini.json  wordle.json  hashtag.json  day.json
tools/           content.mjs (validate/build), wend-layout.mjs, hashtag-layout.mjs, dev-server.mjs
migrations/      D1 schema
public/words.txt Wordle guess list (4–7 letters, SCOWL; licence in words-LICENSE.txt)
test/            node:test unit tests for src/core, plus e2e.mjs (browser play-through of Day 1)
```

## Local development

Needs Node 22.5 or later (the dev server uses `node:sqlite` as a stand-in for D1).

```sh
npm install
npm test                                   # core unit tests
npm run dev                                # http://localhost:8788, admin token "dev"; it prints the babe link
ADVENT_NOW=2026-12-03T15:00:00Z npm run dev   # freeze the clock to play-test a December day
npm run e2e                                # plays all of Day 1 in a headless browser (see below)
```

The dev server includes drafts and keeps its database in `.dev/advent.sqlite`; delete that file to start over. Workers AI isn't available locally, so Pinpoint uses word matching only; `ADVENT_FAKE_AI=1 npm run dev` stands in a fake judge that accepts any guess containing "fakeyes" (the browser test uses it). `npx wrangler pages dev` also works once `wrangler.toml` has real database ids (see `.dev.vars.example`).

**Early access (testing before Dec 1).** Until Day 1 opens, every day can be opened and played, so the whole flow can be tested now. It's on everywhere, production included; `ADVENT_EARLY_ACCESS=0` turns it off. It switches itself off at midnight ET on Dec 1 regardless. While it's on, anyone with the URL (babe included) can open every day that has published puzzles. Solves made during early access are real events: if you test as babe on production, reset those days from the admin page before Dec 1.

**Browser test.** `npm run e2e` starts its own dev server (in-memory database, clock frozen on Nov 28, early access on) and solves every Day 1 game through the UI on a phone-sized screen, with a deliberate mistake in each. It also checks guest isolation, saved mid-puzzle state and the 320px layout. It reads the puzzles from `content/days/01`, so it keeps working once the mocks are replaced. `E2E_DAY=4 npm run e2e` plays another day instead. It needs Playwright, which isn't a dependency: run `npm i --no-save playwright && npx playwright install chromium` once. `SHOTS=.dev/shots npm run e2e` also saves screenshots.

## Writing puzzles

One file per game per day. A puzzle file holds the game data plus optional `draft`, `deadline` and `notes` fields. Drafts are bundled everywhere except production (`main`).

**Wend.** Exactly one end state is accepted: the authored layout. A word traced on any other cells is rejected, so the validator also rejects grids whose letters can be split into the same words another way. Have the layout tool place the words:

```sh
npm run layout -- --shape "....#|..#..|#....|....." --words maple,cedar,oak,pine --theme "Trees" > content/days/01/wend.json
```

`.` is an open cell and `#` a wall, and the open cells must equal the total letters. The tool retries seeds until it finds a layout with exactly one placement.

**Pinpoint.** 5 `clues` and one `answer`. Matching is loose: case, punctuation, plurals, filler words ("things in a…"), "tool box" vs "toolbox", small typos, and the answer plus up to 2 extra words. For "things in/on a <container>" answers, what goes in the container counts on its own: "tools" or "hand tools" for "Things in a toolbox", "junk" for "Things in a junk drawer", "keys" for "Things on a keyboard". That only works for container words (box, case, bag, kit, chest, shelf, shed, bin, rack, basket, belt, drawer, pouch, jar, holder, board), so "beds" doesn't match "Things in a bedroom". An extra word that is one of the clues disqualifies a guess, so "mason jar" doesn't solve "___ jar" and "London bridges" doesn't solve "Bridges". Matching is by words, not meaning, so a guess the words reject goes to the AI judge (below). `aliases` widen the word matcher, `reject` blocks near-misses, and `tests.accept` / `tests.reject` are checked on every validate.

The **AI judge** sees the clues, answer, aliases and guess, and says yes or no. It never overrules you: a guess close to anything in `reject` or `tests.reject` stays wrong without asking it, and `"ai": false` keeps a puzzle word-only. AI-accepted solves are marked in admin and the ntfy push ("AI accepted …"), so you can promote good ones to `aliases` and add bad ones to `reject`. `GET /api/judge` reports whether it's wired up, without calling the model.

**Crossclimb.** `rungs` are listed in ladder order, each one letter from the next. The `ends` (top, bottom) get one shared clue. Players may arrange any valid ladder, reversed included.

**Connections.** Four `groups`, easiest first (shown yellow, green, blue, purple), each with a `name` and exactly 4 `words`. All 16 words must differ, and each word must be at most 14 characters. Players get "One away…" for three of a group. There's no mistake limit; mistakes are counted.

```json
{ "groups": [ { "name": "Card games", "words": ["RUMMY", "POKER", "HEARTS", "SNAP"] }, … ] }
```

**Mini.** A `grid` of rows (`A–Z`, `#` for black squares, up to 9×9) and `clues.across` / `clues.down` keyed by clue number. Numbering follows the usual crossword rules, and the validator lists the numbers it expects. Every white square must belong to a word, and answers can't repeat. The grid checks itself when full; there are no reveals.

```json
{ "grid": ["#HASH", "FORCE", "ANGEL", "SOUND", "TREE#"], "clues": { "across": { "1": "…", "5": "…" }, "down": { "1": "…" } } }
```

**Wordle.** One `answer`, 4–7 letters (the row width follows it). Guesses must be in `public/words.txt`; add names or slang for that day with `allowed`. Six rows show, and running out adds another row instead of failing.

```json
{ "answer": "BRISK" }
```

**Hashtag.** Two five-letter words `across` (rows 2 and 4) and two `down` (columns 2 and 4), crossing at their 2nd and 4th letters, plus a `start`: the board scrambled, five rows of five with `#` off the grid. The player swaps two letters at a time until every square is green; green squares are locked. Par is 12 swaps, and running past it never ends the game. The validator checks the crossings, that `start` holds exactly the solution's letters, and that it can be solved in 12. An optional `theme` shows once it's solved. Have the tool make the scramble, and find words that fit:

```sh
npm run hashtag -- --across jolly,? --down ?,elves                      # list fills from public/words.txt
npm run hashtag -- --across jolly,boxes --down cocoa,elves --theme "…" > content/days/07/hashtag.json
```

`--greens` (default 4) squares start in place and the scramble needs exactly `--swaps` (default 8) at best. It prints the board to the terminal with each square's colour, and the JSON as a draft. Lots of repeated letters make high `--swaps` hard to hit; the tool says so. A miss is a swap that gets no closer: the fewest swaps left didn't drop. A swap can turn nothing green and still be on a best path, so that's not a miss.

```json
{ "across": ["JOLLY", "BOXES"], "down": ["COCOA", "ELVES"], "start": ["#S#O#", "XELAY", "#C#C#", "OJBLS", "#E#V#"] }
```

**`day.json`** holds an optional `afterword`, shown once every game that day is solved.

Before every push:

```sh
npm run validate
```

`validate` checks every puzzle, drafts included. It also stamps a `deadline` on any puzzle going live after its day has opened (new on `origin/main`, or flipped from draft): 24 hours from now, rounded up to the next New York midnight. That way a puzzle published late is never late on arrival. Editing a live puzzle changes its `rev`. Babe's existing solve stays, and stale in-progress state on a device is dropped.

## One-time Cloudflare setup

1. `npx wrangler d1 create advent` and `npx wrangler d1 create advent-preview`, then put both ids in `wrangler.toml`.
2. `npm run db:prod` and `npm run db:preview` apply `migrations/` remotely.
3. Create a Pages project named `adventgamescalendar` from the GitHub repo: framework preset none, build command `npm run build`, output `public` (read from `wrangler.toml`). The Node version comes from `.node-version`.
4. Set the secrets for production, and for preview if you want admin and babe mode there: `ADMIN_TOKEN` and `BABE_KEY` (two different long random strings: `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`) and `NTFY_URL` (e.g. `https://ntfy.sh/<random-topic>`; subscribe to that topic in the ntfy app). Use different values on preview. On preview only, `ADVENT_NOW` freezes the clock for play-testing. `ADVENT_EARLY_ACCESS=0` turns early access off (see above).
   Then send babe her link, `https://advent.useless.blog/#/babe/<BABE_KEY>`, to open once on each device she plays on.
5. In Pages, go to Custom domains and add `advent.useless.blog`. Only then create `CNAME advent → adventgamescalendar.pages.dev` wherever useless.blog's DNS lives (on Cloudflare DNS, Pages creates it for you).
6. Check that `https://advent.useless.blog/robots.txt` disallows everything and that responses carry `X-Robots-Tag: noindex` and a `Content-Security-Policy`.

## Admin

Open `/#/admin` and enter `ADMIN_TOKEN`. From there you can:

- **See babe's progress:** a table of solves, rebuilt from the log.
- **Reset a day:** appends a `reset` event for one game or all of them.
- **Void events:** hides the ones you tick, with a reason. Voiding a void, or voiding a reset, undoes it. Nothing is ever deleted.
- **Preview every day:** plays any day in a session where nothing is saved.

Every solve sends an ntfy push: "Day 7 Wend solved on time, 4m12s, 1 miss". A Pinpoint the AI judge accepted adds `AI accepted "…"`.

## Behaviour notes

- **"Are you babe?" and the babe link:** babe mode needs `BABE_KEY`, which reaches a device once through the link `/#/babe/<key>`. The app checks the key with the server, keeps it in localStorage with `advent.role=babe` and a device id, and drops it from the address bar. Yes at the gate works on a device that has the key; elsewhere it asks for the link. No plays guest mode in localStorage, wipeable from the banner. `/api/events` and `/api/progress` refuse requests without the key (progress also takes `ADMIN_TOKEN`, for the admin page). Changing `BABE_KEY` signs every device out: a 401 makes the app forget the old key, and solves wait in the outbox until the new link is opened.
- **Solves are checked on the server** (`src/core/verify.ts`, with the same rules the games use): the board must have its game's shape and, on the puzzle's current `rev`, actually solve it. A solve from an older `rev` (the puzzle was edited while it sat in the outbox) is checked for shape only. Only the checked fields are stored, a request is capped at 20 KB, and a solve time ahead of the server clock is clamped to it. Admin reads payloads defensively, so an odd event in the log can still be seen and voided.
- **Security headers:** `npm run build` writes `public/_headers` from `src/_headers` (edit that one). The Content-Security-Policy allows scripts from the site only, plus the inline import map by its hash, which changes every build; styles from the site and Google Fonts; no framing. Style attributes are blocked, so `dom.ts` sets string styles through `style.cssText`. The dev server applies `_headers` too, and `npm run e2e` fails on any CSP violation.
- **Updates reach open tabs:** every build stamps the same id into the browser code (`public/js/web/build.js`) and `/api/state` (`build`). A tab running older code reloads itself when it goes back to the calendar or opens a day or game, after saving any puzzle in progress, at most once per deploy. A game being played is left alone until the next page change.
- **Caching:** the useless.blog zone gives `/js/*` and `/styles.css` a 4-hour browser cache that overrides `_headers`, while the page itself is always revalidated. So `public/index.html` is generated by `npm run build` from `src/index.html` (edit that one) with every module at `?v=<build>` through an import map, and a new deploy is always new URLs.
- **Mid-puzzle state:** stays on the device. Only finished solves sync. Offline solves queue in an outbox and send on the next load.
- **Lateness:** compares the solve time, on a device clock synced to the server, with the puzzle's deadline. That's the end of its day in New York, or the stamped `deadline`.
- **Calendar states:** not open, puzzles left, solved late, or solved on the day. One pip per game.
- **No fail states:** Wordle adds rows after the sixth, Connections counts mistakes without ending the game, and Hashtag counts past its 12 swaps. The calendar only knows solved, late or not yet.
- **Pinpoint's AI judge:** runs only after the word matcher says no, with a "Checking…" button meanwhile. If the model is off, slow (8 seconds), over the free allocation or the device is offline, the guess is just a miss. Settings: `ADVENT_AI=0` turns it off, `ADVENT_AI_MODEL` picks another Workers AI model (default `@cf/google/gemma-4-26b-a4b-it`). The player sees an AI-accepted guess as a normal solve.
- **Pinpoint's ending:** a miss on clue 5 offers the answer. Turning it down gives two more guesses, then the offer comes back. Turn it down again and two more misses end the game: "You're cut off. The answer is '…'." A shown answer finishes the game like a solve (it counts toward the day, on time or late, and unlocks the afterword), but the board records `answerShown` (`asked` or `cutoff`). The day page then says Revealed, admin and the ntfy push say "asked for the answer" or "cut off", and the result card leads with that instead of Solved.
- **Keyboards:** Wordle, the Mini and Crossclimb use an on-screen keyboard, so the phone's own keyboard never covers the grid. In Crossclimb the clue, feedback and keys sit in a dock pinned to the bottom of the screen, and the ladder scrolls above it; the active row scrolls into view on open and as typing moves on. A physical keyboard works too (arrows, Tab and space in the Mini; arrows move between rows in Crossclimb). In Hashtag, Tab to a letter and press Enter or Space to pick it.
- **Queens and Patches:** not built yet. The game ids already exist, and the `events` table no longer restricts game ids, so adding a game needs no migration.
