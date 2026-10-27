# Security audit: coolhole.org, 2026-10-27

## Summary

The code had no hardcoded production secrets, now or in its history. There
was no way for a guest to gain mod or admin rank, change another channel's
playlist, or kick or ban anyone. The CyTube base is current with upstream
except for dependency bumps.

The real problems were in the custom code (coolpoints, gambling polls) and
in outdated dependencies:

- **High:** any registered user could stall the whole server through a
  coolpoints timer setting.
- **High:** gamble wagers had no working balance check, so points could be
  minted.
- **High:** password reset links could be pointed at an attacker's domain.
- **High:** 35 dependency advisories, including the HTML sanitizer used for
  chat and MOTD.

13 of the findings are fixed in this PR, one commit each. Everything else is
listed below with a recommendation.

**Line numbers** refer to the audited commit `5c49a55` (branch `3.0`) unless
another commit is named.

## Scope and method

- **Branch:** `3.0` at `5c49a55`. All 5.7k lines of custom code on top of
  upstream CyTube were reviewed: `src/channel/coolhole*.js`,
  `src/coolhole-poll.js`, `src/channel/drink.js`, the email changes, the
  custom client JS and the pug templates.
- **Upstream CyTube areas** (unchanged from upstream): login, registration,
  password reset, sessions, and the socket.io connection and rate limits.
- **Unmerged branch** `feat/share-cards-sitemap-og-image` (commits
  `ab162ffa`, `5e0df1e4`, `48c58c33`). It adds a yt-dlp/Coolhost cache, a
  sitemap and a Dockerfile, and `docs/SESSION_LOG_2026_04_12.md` shows files
  being copied to production with `scp`, so it was treated as possibly live.
  It is reported here but not changed.
- **Secrets:** full history, 2,926 commits on all 41 remote branches. Tools:
  gitleaks 8.21.2, trufflehog 3.88.0, plus regex sweeps over every diff for
  credential assignments and token formats (Google, Mailgun, Stripe, AWS,
  GitHub, Discord, PEM).
- **Dependencies:** `npm audit --omit=dev`.
- **Upstream comparison:** `calzoneman/sync` `3.0` at `a6561272`
  (2026-10-01).
- **Not checked:**
  - the live server, its nginx config, its `config.yaml` and its database;
  - channel permission settings stored in the database;
  - integration tests, which need MySQL.

  Findings that depend on any of these are marked **unverified**.

## Upstream CyTube status

Coolhole is **11 commits behind** upstream `3.0`:

- 9 are dependabot bumps: lodash, qs/body-parser/express, morgan, undici,
  fast-uri, brace-expansion, semver, word-wrap and postcss.
- 2 are media fixes (`eac1547a` saves text and audio tracks; `589f999a`
  fixes bitchute queuing).

None of them is a code-level security fix. The dependency-bump commit in
this PR covers the security-relevant parts of those bumps.

## Findings

| # | Severity | Finding | Status |
| --- | --- | --- | --- |
| 1 | High | Any registered user can stall the server with the coolpoints "active" interval | **Fixed** `63dcdfcb` |
| 2 | High | Gamble wager balance check never ran, so points could be minted | **Fixed** `950dbddc` |
| 3 | High | Password reset link built from the client's `Host` header | **Fixed** `72ac21c9` |
| 4 | High | 35 vulnerable production dependencies (2 critical, 20 high) | **Fixed** (27 of 35) `95aab75f`; rest in #18 |
| 5 | High (unverified) | Dev SQL seed creates site admin `test` with a trivially guessable password | Not fixed: check production |
| 6 | Medium | One guest bet cancels the gamble payout for everyone after it | **Fixed** `666abe2b` |
| 7 | Medium | Coolpoints defaults shared across channels | **Fixed** `91a3fcf2` |
| 8 | Medium | Mods can set negative costs to mint points; `"false"` re-enables actions | **Fixed** `63dcdfcb` |
| 9 | Medium | No limit on failed logins (HTTP and socket.io) | **Fixed** `b8486953` |
| 10 | Medium | Unmerged branch: unbounded yt-dlp downloads triggered by anyone who can queue | Not fixed (unmerged branch) |
| 11 | Medium (unverified) | Unmerged branch: raw video ID reaches Coolhost admin API with the admin token | Not fixed (unmerged branch) |
| 12 | Medium | Unmerged branch: Dockerfile `COPY . .` would bake `config.yaml` secrets into the image | Not fixed (unmerged branch) |
| 13 | Medium (unverified) | Docker compose publishes MariaDB on `0.0.0.0:3306` with example root password | Not fixed (dev branches) |
| 14 | Low | `vote` with no poll open throws an uncaught exception | **Fixed** `289ef487` |
| 15 | Low | `applyPointsToUser` throws on guest input; points not type-checked | **Fixed** `9503cb06` |
| 16 | Low | `javascript:` links in poll titles and options | **Fixed** `4407c35c` |
| 17 | Low | Recovered passwords generated with `Math.random()` | **Fixed** `02239d21` |
| 18 | Medium | Remaining dependency advisories that need major-version bumps | Not fixed: recommendation |
| 19 | Low | Login and password reset reveal whether an account exists and whether an email matches | Not fixed: recommendation |
| 20 | Low | Channel CSS/JS limit of 500k each can exceed the 1 MB channel save limit | Not fixed: recommendation |
| 21 | Low | Smaller gambling and voteskip issues | Not fixed: recommendation |
| 22 | Low | Unmerged branch: server IP and deploy paths in public docs; smaller issues | Not fixed: recommendation |
| 23 | Info | Secrets scan of full history: no coolhole credentials found | No action |

### 1. High: any registered user can stall the server via the coolpoints interval

**Location:**
- `src/channel/coolholepoints-actions-options.js:528` (`isValidPoints`)
- `src/channel/coolholepoints-actions-options.js:572` (`parseInt(val) || 0`)
- used in `src/channel/coolholepoints.js` `handleActive`

**Exploit:**
1. Any registered user creates a channel, which makes them its owner.
2. They emit `setCpOptions {actionName:"active", optionName:"interval", optionValue:-1}`.
   The values `"0.5"` or `2147484` work too. Node treats all of them as about
   1 ms.
3. Every logged-in user in that channel now runs `earn()` about every
   millisecond. Each call broadcasts and writes to the log.
4. A few accounts in that channel load the single Node process that serves
   every channel, and fill the disk with logs.

**Fix:** the interval must be a whole number of seconds from 10 to 86400.
Values already stored in channel data are also clamped where the timer
starts, in case a bad value was saved earlier. Tests:
`test/channel/coolholepoints-actions-options.js`.

### 2. High: gamble wager balance check never ran, so points could be minted

**Location:** `src/channel/coolhole-poll.js:271`

**Cause:** the check was `data.wager > user.points + 10000`. `user.points` is
never set anywhere, so the comparison is always false and any wager is
accepted. Points are only settled at payout.

**Exploit:**
- A 0-point account bets `1e12` on option A. An alt account on another IP
  bets 100 on option B. If B wins, the alt receives about `1e12`. If A wins,
  the big bet takes the whole pot.
- Two bets of about `1e308` each overflow the pot to `Infinity`, which turns
  balances into `Infinity` or `NaN`.

**Fix:** the wager is now compared to the bettor's real coolpoints balance,
keeping the existing 10000-point debt allowance. It must be a safe whole
number; the client already sends `parseInt`. Tests:
`test/channel/coolhole-poll.js`.

### 3. High: password reset link built from the client's `Host` header

**Location:** `src/web/account.js:615`. This is inherited from upstream,
which has the same code.

**Exploit:**
1. The attacker requests a reset for the victim with `Host: attacker.example`.
   They first fetch the form themselves to get a CSRF token.
2. The victim gets a genuine reset email whose link points to
   `http(s)://attacker.example/account/passwordrecover/<token>`.
3. If the victim clicks it, the attacker gets the token. Posting it to the
   real site returns a new password to the attacker: account takeover.

**Conditions:**
- The attacker must know the victim's email. Finding #19 lets them confirm a
  guess.
- The reverse proxy must pass arbitrary `Host` values through. That is common
  when the coolhole server block is nginx's default server. This part is
  **unverified** because the production proxy config was not available.

**Fix:** the link is only built if `Host` is the configured `http.root-domain`,
a subdomain of it, or one of `http.alt-domains`. This is the same rule
`/login` already enforces, so if login works in production, resets will too.
Tests: `test/web/account.js`.

### 4. High: 35 vulnerable production dependencies

**Source:** `npm audit --omit=dev` on `5c49a55` reported 35 advisories:
2 critical, 20 high, 8 moderate, 5 low.

**Relevant to this app:**
- `sanitize-html` ≤2.17.7: XSS filter bypasses. It is CyTube's sanitizer for
  chat, MOTD and profiles.
- `proxy-addr` ≤2.0.7 (critical): IP spoofing through IPv4-mapped IPv6 in
  trusted subnets. It affects IP bans and rate limits if `trust-proxies`
  contains subnets.
- `socket.io` / `engine.io` / `socket.io-parser` / `ws`: remote DoS through
  memory exhaustion and connection exhaustion.
- `express` (XSS in `res.redirect`), `body-parser`, `qs`, `path-to-regexp`,
  `lodash`, `morgan`.

**Fix:** `npm audit fix` without `--force`, which keeps every package within
its existing semver range and changes only `package-lock.json`. 8
advisories remain; see #18.

### 5. High (unverified): dev seed creates site admin `test` with a trivially guessable password

**Location:** `docker/build/ch_dump.sql` in commit `316c9f9c` (branches
`dev/docker`, `feat/slots-config-back`).

**Detail:**
- The dump inserts user `test` with `global_rank` 255 (site admin), a bcrypt
  hash, and a private LAN IP.
- The hash is public. A check against a 15-word common-password list matched
  on the first try.

**Exploit:** if this dump was ever imported into the production database,
anyone can log in as a site admin (ACP, global bans, all channels).

**Action for Sean:**
- Check the production `users` table for `test` (or any unexpected
  `global_rank >= 255`), and delete or demote it if found.
- Removing the file from history is optional; the password is weak, not
  secret.

### 6. Medium: one guest bet cancels the gamble payout for everyone after it

**Location:** `src/channel/coolholepoints.js:899`, the `return` inside the
`payoutPoll` loop.

**Exploit:**
1. Voting is open to guests and anonymous viewers by default
   (`pollvote: -1`).
2. An anonymous viewer places a 1-point bet right after a gamble opens.
3. At payout, the loop returns on that ineligible voter. Nobody after them is
   paid or charged, and the poll is then cleared.

**Fix:** gamble bets from users who can't hold coolpoints are refused, and
payout skips such voters instead of stopping. Tests:
`test/channel/coolhole-poll.js`, `test/channel/coolholepoints.js`.

### 7. Medium: coolpoints defaults are shared across channels

**Location:**
- `src/channel/coolholepoints-actions-options.js:416`
  (`this.coolpointsActions = this.actionsDefault`)
- `src/channel/coolholepoints-actions-options.js:410` (default objects pushed
  by reference)

**Exploit:**
- Channels with no saved settings use the module-level defaults array itself,
  not a copy.
- The owner of a brand-new channel disables `highlight` (or changes any
  option). That change appears in every other channel on defaults, and in
  every channel created afterwards, until restart.
- Default actions added to an existing channel's saved data are shared the
  same way.
- This was confirmed by running two module instances.

**Fix:** the defaults are deep-copied with `clone`. Tests:
`test/channel/coolholepoints-actions-options.js`.

### 8. Medium: mods can mint points with negative costs; `"false"` re-enables actions

**Location:**
- `src/channel/coolholepoints-actions-options.js:528`
- `src/channel/coolholepoints-actions-options.js:575`

**Exploit:**
- A rank-2 mod sets the `highlight` cost to `-1000000`, then types
  `/highlight x`. `spend()` subtracts a negative number, which adds a million
  points. This bypasses the rank-3 check in `canUpdateOthersPoints`.
- Separately, `!!"false"` is `true`, so sending the string `"false"`
  re-enables an action.

**Fix:**
- `points` must be a non-zero whole number up to 1e9. Only debt-level
  thresholds (`Statuses`) may be negative, as their defaults are.
- `enabled` only treats `true` or `"true"` as true.
- A `null` payload is ignored.

### 9. Medium: no limit on failed logins

**Location:**
- `src/web/auth.js:73` (`/login`)
- `src/user.js:323` (socket.io `login` event)

**Exploit:** unlimited online password guessing against any account. One
socket could retry forever. Registration accepts any non-empty password.

**Fix:** after 20 wrong username/password failures from one IP in 15 minutes,
both paths refuse further attempts until the window ends. The limiter
(`src/util/login-throttle.js`) is in memory, counts failures only, and
sweeps expired entries. Tests: `test/util/login-throttle.js`.

**Follow-up:** consider a minimum password length at registration.

### 10. Medium: unbounded yt-dlp downloads triggered by anyone who can queue (unmerged branch)

**Location:** `ab162ffa`:
- `src/ytdlp.js:13-28`
- `src/coolhost-cache.js`
- `src/get-info.js`
- the max-length check in `src/channel/playlist.js`

**Exploit:**
1. Anyone allowed to queue videos (often guests) queues long age-restricted
   videos.
2. yt-dlp downloads them at best quality with no size limit.
3. The channel's max-length setting is only checked after the download.
   Downloads run in parallel across channels, and unregistered channels are
   created on demand.
4. Files stay for 8 hours. Partial `*.part` files are left behind on timeout.
5. Result: disk, bandwidth and CPU exhaustion, and a stalled queue.

**No command injection:** `spawn` is called with an args array, and the ID is
only appended to a fixed `watch?v=` URL.

**Recommendation:**
- Check the duration before downloading.
- Pass `--max-filesize` and `--match-filter "duration<N"` to yt-dlp.
- Add a global limit on concurrent downloads.
- Use a temporary folder per job and delete it on failure.
- Consider limiting this to registered users.

### 11. Medium (unverified): raw video ID reaches the Coolhost admin API (unmerged branch)

**Location:** `ab162ffa:src/coolhost-cache.js:59` builds
`coolhostUrl + "/api/cache/yt/" + videoId` with
`Authorization: Bearer <admin-password>`. The ID comes straight from the
socket; it is only checked to be a string.

**Exploit (unverified):**
- The YouTube API accepts comma-separated IDs, so `REALID,x/../../<path>`
  could still resolve to a real video.
- `new URL` would then normalize the path into any Coolhost endpoint, which
  receives the admin token.
- Variants like `REALID,1` and `REALID,2` also get past the cache and the
  duplicate-download lock, which makes #10 worse.
- Not confirmed: the YouTube API was not called, and Coolhost's code is not in
  this repo.

**Recommendation:**
- Require `/^[A-Za-z0-9_-]{11}$/` for YouTube IDs.
- Use the API's returned `video.id`, not the user's string.
- Wrap the ID in `encodeURIComponent`, and add `--` before the URL in the
  yt-dlp arguments.

### 12. Medium: Dockerfile would bake config secrets into the image (unmerged branch)

**Location:** `ab162ffa:Dockerfile:13` runs `COPY . .`. `.dockerignore` only
lists `node_modules`, `lib` and `www/js/player.js`.

**Exploit:** a local build copies `config.yaml` into the image. That file
holds the database password, cookie secret, YouTube key and Coolhost admin
password. Pushing the image to any shared registry leaks them.

**Other issues:** the container runs as root on Node 18, which is end-of-life.

**Recommendation:**
- Add `config.yaml`, `conf/`, `*.key`, `*.crt`, `*.pem` and `.git` to
  `.dockerignore`.
- Add a non-root `USER`.
- Use a supported Node version.

### 13. Medium (unverified): Docker compose exposes MariaDB with the example root password

**Location:**
- `316c9f9c:docker/compose.yml:13` publishes `"3306:3306"` on all
  interfaces, and `compose.prod.yml` keeps it.
- `docker/.env.example` contains a weak example root password and
  application database password.

**Exploit:** if production runs this compose file with the example `.env`,
the database is reachable from the internet with a known root password.

**Recommendation:**
- Don't publish 3306 (or bind it to `127.0.0.1`).
- Use strong generated passwords.
- If these example values were ever used on a real server, **rotate** them.

### 14. Low: `vote` with no poll open throws

**Location:** `src/channel/coolhole-poll.js:262` reads `this.poll.gamble`
before checking that `this.poll` exists.

**Impact:** any user can emit `vote` with no poll open. Each emit writes a
fatal uncaught-exception log line. With `debug: true` the process exits,
taking the site down.

**Fix:** return early when no poll is open. Fixed in `289ef487`.

### 15. Low: `applyPointsToUser` throws on guest input

**Location:**
- `src/channel/coolholepoints.js:427` references the undefined variable
  `userName`.
- The `catch` block at `:477` reads `data.targetName` from an undefined
  payload.

**Impact:** any connection can trigger a fatal log line per emit, or a
process exit when debug is on. Admins could also store `NaN` or `Infinity`
as a balance.

**Fix:** null payloads are ignored, the variable reference is fixed, and
points must be a safe whole number. Fixed in `9503cb06`.

### 16. Low: `javascript:` links in poll text

**Location:** `src/coolhole-poll.js:8`. Inherited from upstream
`src/poll.js`.

**Exploit:** any `scheme://` text in a poll title or option became a link,
and unlike chat it never went through `sanitizeHTML`. A poll creator could
add `javascript://%0a…` as a clickable link that runs script for whoever
clicks it.

**Who can do it:** anyone with `pollctl` (rank 1.5 by default).
Browser-dependent because of `target=_blank`.

**Fix:** only `http`, `https` and `ftp` URLs become links. Fixed in
`4407c35c`.

**Note:** upstream `src/poll.js` is not loaded by coolhole and was left
unchanged.

### 17. Low: recovered passwords used `Math.random()`

**Location:** `src/web/account.js:711`. Inherited from upstream.

**Fix:** use `crypto.randomInt`, keeping the same alphabet and length. Fixed
in `02239d21`.

### 18. Medium: remaining dependency advisories need major bumps

| Package | Advisory | Notes |
| --- | --- | --- |
| `bcrypt` 5.x → 6 | Pulls in `tar` (critical) and `@mapbox/node-pre-gyp` (high) | Install-time only (prebuilt binary download), not runtime |
| `nodemailer` 6.x → 10.2.1 | SMTP command/CRLF injection | Only used when `email-type` is SMTP |
| `toml` 3.x → 5.0.1 | DoS and prototype pollution | Parses local trusted config files only |
| `uuid`, `short-uuid`, `@cytube/mediaquery` | Moderate | No fix available |

**Recommendation:** bump these one at a time with a manual smoke test.

### 19. Low: login and reset reveal whether an account exists

**Location:**
- `src/database/accounts.js:259` returns "User does not exist" at login.
- `src/web/account.js:562` says whether the email you entered matches the
  username's email.

**Impact:**
- Usernames are already public on CyTube (user lists, registration), so the
  login message adds little.
- The reset form is an **email oracle**: it confirms a guessed email for a
  known username. That helps #3 and enables targeted phishing.

**Recommendation:** always reply "if that username and email match, a reset
email was sent".

**Status:** not changed here, because it changes upstream user-facing
behavior.

### 20. Low: channel CSS/JS limit can exceed the channel save limit

**Location:** `src/channel/customization.js:119` and `:135`. The custom
CSS/JS limit was raised from 20k to 500k each (`2707b7b`).

**Impact:**
- Only channel admins can set these, and they can already run JS for every
  visitor, so this is not a privilege escalation.
- 500k CSS plus 500k JS, JSON-escaped, can exceed `SIZE_LIMIT = 1048576` in
  `src/channel-storage/dbstore.js:7`. Then every channel save fails, so
  coolpoints, playlist and poll changes stop persisting.

**Recommendation:** cap the combined size below 1 MB, and return an error
instead of silently truncating.

### 21. Low: smaller gambling and voteskip issues (not fixed)

- **Hidden gambles leak stake totals.** `src/coolhole-poll.js:116-146`
  (`toUpdateFrame`) always includes `wagers`. `handleEndBetting`
  (`src/channel/coolhole-poll.js:332`) sends the unobscured frame to
  everyone.
- **Malformed `/poll` text throws.** `parsePollMesage`
  (`src/channel/coolhole-poll.js:24`, used at `:428`) throws on text that
  doesn't match, after the current poll has already been closed. Mods only.
- **Winner can be picked while betting is open.**
  `src/channel/coolhole-poll.js:392` doesn't check `gambleStatus`. A mod who
  bet can also pick the winner.
- **Voteskip charges before the duplicate check.** `src/channel/voteskip.js:39`
  takes points before the repeat-vote check, so spamming `voteskip` keeps
  charging the user. Self-harm only.
- **Possible voteskip crash (unverified).** `src/channel/voteskip.js:110`
  could throw if `playlist.current` is null.
- **Inverted guard.** `src/channel/coolholepoints.js:1184` uses `&&` where
  `||` was meant. Harmless today, because `spend()` rejects guests.
- **Debt filters run after sanitizing (unverified).**
  `src/channel/coolholepoints.js:994` changes chat HTML after `sanitizeHTML`.
  No working payload could be built, since the filters only delete letters
  or insert `th` and `-`.
- **Info:** `coolpointsInitResponse` (`:359`) sends every registered user's
  name and balance to every connection, including guests.

### 22. Low: server details and smaller issues on the unmerged branch

- **Server details in public docs.**
  - `ab162ffa:docs/age-restricted-videos-plan.md:21` and `:70` contain the
    production server's public IP. Line 70 shows Coolhost serving plain HTTP
    on port 3800 at that IP.
  - `docs/SESSION_LOG_2026_04_12.md:62` and `SESSION_LOG_2026_04_18.md:27`
    contain deploy paths.
  - **Recommendation:** firewall port 3800 to localhost (the Coolhost admin
    bearer token would otherwise travel in cleartext), and drop these details
    before merging. Purging them from history is optional; see below.
- **`renameMedia` is not rate-limited** (`ab162ffa:src/channel/playlist.js`).
  Each call broadcasts to the whole channel and writes to the channel log. A
  guest who takes a departed guest's name can rename that guest's items.
- **Coolhost error text reaches users.** `ab162ffa:src/coolhost-cache.js:170`
  sends errors such as `ECONNREFUSED 127.0.0.1:3800` back to the person
  queuing.
- **Sitemap uses the `Host` header.** `48c58c33:src/web/routes/sitemap.js:15`
  and `:34` build URLs from `Host`. That only matters if a cache in front
  ignores `Host`.
- **Corrupted `.gitignore`.** `5e0df1e4` appended UTF-16 text to the
  `.vscode` entry, so `.vscode/` is no longer ignored.

### 23. Info: secrets scan of the full history

**Results:**
- gitleaks: 4 hits, all upstream test fixtures (`test/camo.js`, 2017) and a
  minified library.
- trufflehog: 0 hits.
- Manual sweeps: no coolhole credentials.

**What was found:**
- **SoundCloud client ID** in upstream `calzoneman/sync` commits from 2013
  (e.g. `5f5049db`; removed upstream in `5f799fe1`). It is upstream's public
  client ID, not coolhole's. No action.
- **Placeholder values only:** `conf/example/email.toml` (`7fc1862b`), the
  Stripe placeholders in `ab162ffa`, and `config.template.yaml`.
- **Dev-only weak passwords** in `docker/.env.example` (`91207ef8`,
  `316c9f9c`). See #13: rotate them if they were ever used for real.
- **Dev seed** `docker/build/ch_dump.sql` (`316c9f9c`). See #5.
- **Not tracked:** real config files (`config.yaml`, `conf/*.toml`, `*.key`,
  `*.pem`) are covered by `.gitignore` and appear in no commit.

**History purge:** none required. Optionally, Sean may remove these from
history: `docker/build/ch_dump.sql` (`316c9f9c`), and the server IP and
deploy paths in the `ab162ffa` docs. No history was rewritten in this
session.

## Checked with no issue found

- **Ranks and permissions.** All new socket events check permissions on the
  server:
  - opening a poll, ending betting and picking the winner use
    `canControlPoll`;
  - coolpoints options use `canSetOptions`;
  - applying points to others needs rank > 2;
  - `drink.js` checks permissions.

  Guests cannot raise their rank, kick, ban, or change another channel's
  playlist. Ranks and kick/ban are upstream code, unchanged.
- **Client-side XSS.** Custom client JS uses `.text()` or `textContent` for
  user data. Every `.html()` sink was traced to server-side sanitizing.
  Custom pug templates have no `!=` or `!{}`. Clients cannot inject
  `coolholeMeta`.
- **SQL.** All queries in custom code use `?` placeholders. There is no
  string-built SQL.
- **Data in broadcasts.** No IP addresses leak.
- **Password hashing.** bcrypt with cost 10; passwords capped at 100
  characters.
- **Session cookies.** Signed, and include the bcrypt hash.
- **CORS.** socket.io only accepts origins from an allowlist:
  `io.cors.allowed-origins` plus the configured io/https domains
  (`src/io/ioserver.js:512`, unchanged from upstream). The HTTP server adds
  no CORS headers.
- **Debug.** Debug mode is on only when the `DEBUG` environment variable is
  `1` or `true` (`src/config.js:283`). The dev `docker/.env.example` sets
  `DEBUG=true`. Make sure production does not: in debug mode, any uncaught
  exception (such as #14 or #15) exits the process.

## Test results

Unit tests (`npx mocha --recursive --exit test`), Node 22.22.0:

| Run | Passing | Failing |
| --- | --- | --- |
| Before (`5c49a55`) | 143 | 3 |
| After (this branch) | 177 | 3 |

- **The 3 failures are pre-existing and identical in both runs:**
  - two `VoteskipModule #update` tests, whose mocks lack the custom
    `coolholecommon` module;
  - one `custom-media` hook timeout, which needs network access.
- **34 tests were added** for the fixes above.
- **`npm test` stops at lint** before mocha runs, both before and after,
  because of pre-existing ESLint errors (22 before, 21 after; one of these
  fixes removed an undefined-variable error).
- **Not run:** integration tests, which need MySQL.

## Deploy notes for Sean

- **Nothing to configure** for any of the fixes.
- **Password reset** (#3) uses the same domain rule as login. If someone can
  log in at the production domain, resets will work there too.
- **Dependencies** (#4): after pulling, run `npm ci`. `postinstall` rebuilds
  `lib/` and the player.
- **To check on the live server:**
  - #5: a `test` site-admin user in the database;
  - #13: MariaDB reachable on port 3306;
  - #22: Coolhost reachable on port 3800.
