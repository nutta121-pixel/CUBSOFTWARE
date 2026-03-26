# CUBSOFTWARE — Marbles Game TODO

Status key: `[ ]` todo · `[x]` done · `[-]` in progress

> **Currency:** Points = leaderboard rank (cannot be spent). Coins = spendable currency for abilities & shop.

---

## Build Order (logical phase sequence)

| # | Phase | Status |
|---|-------|--------|
| 0 | Dev Infrastructure | ✅ Done |
| 1 | Physics Foundation | ✅ Done |
| 2 | Core Race Loop | ✅ Done |
| 3 | Editor → Play Page Handoff | ✅ Done |
| 4 | Session Settings & Race Config (respawn/elimination, physics sliders) | ✅ Done |
| 5 | OBS Browser Source Mode | ✅ Done |
| 6 | Track Pieces — Basic (covered in Phase 1) | ✅ Done |
| 7 | 20 New Track Pieces | ✅ Done |
| 8 | 80 More Track Pieces | ⬜ |
| 9 | Obstacle & Effect System | ✅ Done |
| 10 | 20 More Obstacles | ⬜ |
| 11 | 50 More Obstacles | ⬜ |
| 12 | 100 More Obstacles | ⬜ |
| 13 | Points, Scoreboards & Player Stats | ✅ Done |
| 14 | Global Leaderboard | ✅ Done |
| 15 | Map System (save/load/browse/thumbnails) | ✅ Done |
| 16 | Coins & Chat Abilities | ✅ Done |
| 17 | Player Settings & Preferences | ✅ Done |
| 18 | Marble Cosmetics — Core skins/trails/accessories | ✅ Done |
| 19 | Marble Cosmetics — 50 more skins/trails/accessories | ⬜ |
| 20 | 100 More Options, Settings & Customisation | ⬜ |
| 21 | Achievements & Badges | ✅ Done |
| 22 | Polish & Visual Effects (sounds, particles, camera, shadows) | ✅ Done |
| 23 | Twitch Integration Enhancements | 🔄 In Progress |
| 24 | Advanced Game Modes (tournament, elimination, time trial, ghost) | 🔄 In Progress |
| 25 | Seasonal Events & Special Modes | ⬜ |
| 26 | Social & Community Features | ⬜ |
| 27 | Race Replay & Spectator System | ⬜ |
| 28 | Map Editor Enhancements | ✅ Done |
| 29 | Streamer Dashboard | ✅ Done |
| 30 | Analytics & Streamer Insights | ⬜ |
| 31 | Mobile & Accessibility | ✅ Done |
| 32 | Infrastructure & Performance | ⬜ |
| 33 | Marble Character-Select System | ✅ Done |
| 34 | User Title / Prefix System | ✅ Done |

---

## Phase 0 — Dev Infrastructure

- [x] Reorganise marbles assets into `website/marbles/` folder
- [x] Flask route `/marbles/static/<path>` to serve marbles assets
- [x] Beta whitelist (`MARBLES_BETA_USERS`) on marble editor route
- [x] Anonymous Twitch IRC reader (`marbles_irc.py`) — no OAuth required
- [x] Marble game session API (create, get, start, end, reset, kick)
- [x] Game tab in editor right panel (lobby setup + player list UI)
- [x] Lobby tab JS (create session, 2s polling, start/reset/end handlers)
- [x] Lobby tab CSS (tab bar, player rows, kick button)
- [x] `dev_server.py` — inject `cub_user` session with owner Discord ID so all beta/admin routes pass without going through Discord OAuth

---

## Phase 1 — Physics Foundation

- [x] Add `cannon-es` to importmap in `play.html`
- [x] `website/marbles/play.html` — full-screen race viewer page (canvas + HUD + results + countdown + error overlays)
- [x] `website/marbles/css/play.css` — race HUD, countdown, results screen, announcements, photo finish, slow-mo badge, OBS overrides
- [x] `website/marbles/js/play.js` — Three.js scene + cannon-es world + fixed-step physics loop (1/60s) + full render loop
- [x] `website/marbles/js/colliderBuilder.js` — piece ID → `CANNON.Body[]` factory
  - [x] `straight` — box floor + 2 wall strips
  - [x] `ramp_up` / `ramp_down` — angled box rotated on X axis
  - [x] `start` — flat platform box
  - [x] `finish` — flat platform box + AABB exported
  - [x] `corner_l` / `corner_r` — 8 arc-segmented boxes + inner/outer walls
  - [x] `funnel` — 4 angled wall boxes
  - [x] `loop` — 16 arc-segmented boxes (full vertical circle)
  - [x] `pipe` — 6 flat panels (hexagonal prism tunnel)
  - [x] `bridge` — 3 sag-segmented boxes with walls
  - [x] `bumper` — CANNON.Sphere with bouncy material
  - [x] `hammer` / `rotating_post` — kinematic bodies
  - [x] `moving_platform` — kinematic body with oscillation
  - [x] `spring` — angled box; effectsHandler launches marble on contact
  - [x] `teleporter` — flat box; pair teleportation via `props.pairId`
  - [x] `checkpoint` — thin gate box; gameController tracks passage
  - [x] `ice_zone` / `mud_zone` — special contact materials (near-zero friction / high friction)
  - [x] `destruct_cube` — solid box removed from world on marble hit
  - [x] Multiple contact materials: track, bouncy, ice, mud
- [ ] Wire up physics test — load a simple map (straight → ramp → finish) and verify marble rolls through correctly
- [ ] Tune gravity (currently −35) and marble damping for good feel
- [ ] Verify cannon-es SAPBroadphase handles 100+ marble bodies without frame drops

---

## Phase 2 — Core Race Loop

- [x] Race state machine: `LOADING → COUNTDOWN → RACING → FINISHING → RESULTS`
- [x] Marble spawning — grid layout above start piece, staggered height, ±jitter
- [x] Username → consistent HSL colour hash
- [x] Canvas-based nametag sprites floating above each marble
- [x] Trail system — `THREE.Line` of last 20 positions per marble, fades
- [x] Physics → visual sync each frame (position + quaternion)
- [x] Countdown overlay: 3 → 2 → 1 → GO! with pulse animation; marbles frozen until GO
- [x] Finish line AABB detection; marble frozen and ranked on crossing
- [x] Checkpoint tracking — marbles respawn at last checkpoint instead of start
- [x] Fall-off detection (Y < lowestTrackY − 25) → respawn at last checkpoint / start
- [x] Race timeout (3 min) → unfinished marbles ranked by distance to finish
- [x] Photo finish detection — "PHOTO FINISH" overlay when 2 marbles finish < 0.6s apart
- [x] Last-marble drama slow-mo (physics runs at 0.3× when 1 marble remains)
- [x] Finish announcement — name + placement pops up mid-screen; particle burst
- [x] Green flash on finish line crossing
- [x] Particle system — spawn + gravity + fade; used by boost, spring, finish, teleport
- [x] HUD: race timer, marble count (racing / finished), top-5 live leaderboard sorted by distance to finish
- [x] Camera modes: Leader (chase cam with velocity look-ahead), Overview (isometric), Free (OrbitControls) — press C to cycle
- [x] Session polling every 5s — end race early if session killed from editor
- [x] Results overlay — full ranked list with colours, times, DNF, medals
- [x] Submit results to `POST /marbles/api/game/<id>/results` on race end
- [x] OBS auto-start — play page in `?obs=1` mode watches session and auto-starts countdown when `state === 'running'` (currently needs session data in sessionStorage)
- [x] Sound effects (Web Audio API) — rolling, collision, boost, countdown beeps, finish fanfare

---

## Phase 3 — Editor → Play Page Handoff

- [x] Flask route `GET /apps/marble-play` → `render_template('marbles/play.html')` with beta whitelist
- [x] Flask route `POST /marbles/api/game/<id>/results` — stores results + sets state=ended
- [x] `results` field added to `MarbleSession` and exposed in `to_dict()`
- [x] `results` field added to `MarbleSession.to_dict()`
- [x] In `editor.js` `_lobbyStart()`: serialize map to `sessionStorage`, navigate to `/apps/marble-play`
- [x] Editor lobby panel: show results table when session `state === 'ended'`
- [x] "Race Again" → reset session → write restore data → navigate back to editor
- [x] "Back to Editor" button on results screen writes restore data → editor restores session state
- [x] `_restoreSession()` — on editor load, check `sessionStorage('marbles_restore')`, restore lobby + map

---

## Phase 4 — Obstacle & Effect System

> Note: Boost pad, wind zone, no-gravity zone, spring, teleporter, laser, hammer, moving platform and kinematic effects are already wired into `play.js`. These items track refinement and the 20 new obstacles.

- [ ] Tune boost pad impulse strength feel
- [x] Bongo pad visual squish animation when hit
- [x] **20 additional obstacle pieces to add to editor + colliderBuilder + play.js:**
  - [x] **Gravity Flip Zone** — reverses world gravity while marble is inside; creates upside-down section of track
  - [x] **Magnet** — pulls all marbles within radius towards it; configurable attract/repel polarity
  - [x] **Black Hole** — extreme point attractor; marbles orbit and get slung out in a random direction
  - [x] **Cannon** — barrel piece; marble enters and is launched in a configurable direction at high speed
  - [ ] **Portal Gate** — one-way gate; marble passes through and exits from linked exit portal (direction preserved)
  - [x] **Slippery Slope** — ramp variant with near-zero friction; marble slides unpredictably sideways
  - [x] **Sticky Pad** — high-friction patch; marble slows dramatically, almost stops, then releases
  - [x] **Shrink Zone** — marble visually scales down to 0.3× while inside; normal physics, disorienting visually
  - [x] **Giant Zone** — marble scales up to 2.5× visually and gains +50% mass temporarily
  - [x] **Reverse Pad** — applies impulse in the exact opposite direction the marble is travelling (hard brake + flip)
  - [x] **Trampoline** — large flat surface with very high restitution and upward bias; always bounces upward
  - [x] **Conveyor Belt** — straight piece with texture scrolling; applies constant sideways or forward force to marble
  - [x] **Rotating Ring** — hollow ring spinning on its axis; marble must pass through the hole at the right time
  - [x] **Pendulum** — heavy ball on a chain swings across the track; kinematic collision body on swinging arc
  - [x] **Spike Strip** — flat pad that teleports marble back 1 checkpoint on contact (like a penalty zone)
  - [x] **Speed Limiter** — zone that caps marble velocity to a configurable maximum (e.g. slow-mo zone)
  - [x] **Ghost Block** — looks solid (opaque mesh) but has no physics body; marbles pass through it
  - [x] **Earthquake Pad** — standing on it applies random shaking forces for 2 seconds after contact
  - [x] **Glue Trap** — marble that rolls over it gets stuck for 1.5 seconds then released
  - [x] **Pinball Bumper Ring** — ring of 6 bumpers arranged in a circle; very high restitution; marble ricochets between them

---

## Phase 5 — OBS Browser Source Mode

- [x] `?obs=1` URL param — hides UI chrome, sets `body.obs-mode` class, CSS hides action buttons
- [x] `?transparent=1` / `?obs=1` — Three.js renderer `alpha: true`, clear colour opacity 0
- [x] Flask route `/marbles/obs/<session_id>` — no login required, pre-loads session ID via URL
- [x] **Auto-start polling** — OBS page polls `GET /marbles/api/game/<id>` every 2s; shows "Waiting for race to start…" overlay; starts countdown automatically when `state === 'running'`
- [x] **OBS scene presets** — URL params to configure the view without touching editor:
  - [x] `?cam=leader` / `?cam=overview` / `?cam=side` — force camera mode
  - [x] `?hud=0` — hide HUD entirely (for minimal overlay)
  - [x] `?hud=leaderboard` — show only leaderboard strip
  - [x] `?hud=timer` — show only race timer
  - [x] `?results=0` — suppress results overlay (streamer shows results manually)
  - [x] `?width=1920&height=1080` — set internal render resolution independent of window size
- [x] **OBS Dock integration** — `/marbles/obs-control/<session_id>` is a minimal HTML page usable as an OBS Dock with Start/Reset/End buttons and live player list; no full 3D scene
- [x] **Lower-third overlay** — separate `/marbles/lowerthird/<session_id>` URL for a 1920×180 transparent strip showing live leaderboard top 5; designed for OBS as a bottom-of-screen overlay
- [x] **Winner card overlay** — separate `/marbles/winner/<session_id>` URL for a 400×200 animated winner announcement; can be shown as a Scene transition in OBS
- [x] **Chat follower** — OBS-mode page shows a small scrolling panel of players who just joined via `!join`
- [x] **Auto-reconnect** — if the OBS source loses the session (server restart), it polls until session reappears and resets cleanly
- [x] **Performance mode for OBS** — `?perf=1` disables shadows, trails, particles, reduces marble poly count to 6-segment sphere; targets stable 60fps even on low-end capture PCs
- [x] **Custom OBS background** — `?bg=COLOR` (hex) sets the Three.js clear colour; allows matching stream overlay colour scheme without editing CSS

---

## Phase 6 — Points, Scoreboards & Player Stats

> **Points** are the competitive leaderboard currency. They are earned by finishing races and determine your global rank. Points cannot be spent — they only go up. Separate from coins (see Phase 14).

- [x] `marbles_db.py` — SQLite module: `init_db()`, `award_race_results()`, `get_leaderboard()`, `get_player()`, `get_track_records()`, `get_map_leaderboard()`
- [x] Database table: `marble_players` (twitch_login, wins, races_played, points, coins, total_finish_ms, last_played, win_streak, best_win_streak, total_respawns)
- [x] Database table: `marble_races` (race_id, map_id, map_name, played_at, channel, player_count, winner)
- [x] Database table: `marble_race_results` (race_id, twitch_login, rank, finish_time_ms, points_awarded, coins_awarded, respawns)
- [x] Database table: `marble_track_records` (map_id, map_name, twitch_login, finish_time_ms, race_id, set_at)
- [x] **Points system**: 1st=25 · 2nd=18 · 3rd=15 · 4th=12 · 5th=10 · 6th=8 · 7th=6 · 8th=4 · 9th–12th=2 · 13th+=1 · DNF=0
- [x] Bonus points: track record +15, clean race (0 respawns) +5, win streak bonus (+2/win capped at +20)
- [x] Win streak tracking — resets on any non-1st finish
- [x] Coins per race — 1st=100, 2nd=75, 3rd=60, 4th=50, 5th=40, 6th=30, 7th–10th=20, 11th+=10, DNF=5
- [x] `play.js` `submitResults()` — computes SHA-256 map_id, sends map_id + map_name with results
- [x] `POST /marbles/api/game/<id>/results` — writes to DB, returns per-player points+coins summary
- [x] Player profile page `/marbles/player/<twitch_username>` — rank, stats, track records, race history
- [x] "Comeback King" stat — most times winning from last place at halfway
- [x] "Iron Marble" stat — `clean_races` column in DB; incremented on every finish with 0 respawns
- [x] "Collector" stat — `coins_earned_total` column in DB; tracks all-time coins earned regardless of spending

---

## Phase 7 — Global Leaderboard (Points-Based)

> Leaderboard ranks players by **points** only. Coins are not displayed here — they are personal spending currency.

- [x] Track record = fastest finish time per map_id; broken record awards +15 pts bonus
- [x] Global leaderboard page `/marbles/leaderboard` — sort tabs: Points / Wins / Races / Win Streak / Coins
- [x] API `GET /marbles/api/leaderboard?sort=points&limit=100`
- [x] API `GET /marbles/api/player/<login>` — full player JSON
- [x] API `GET /marbles/api/track-records` + `?map_id=<id>` for per-map top times
- [x] Map ID: SHA-256 of piece positions+types (8-byte hex prefix, computed client-side)
- [x] "New Record!" overlay animation on play page when track record broken mid-race
- [x] Per-map leaderboard page `/marbles/leaderboard/<map_id>`
- [x] Season system — points reset each season; season winner gets exclusive cosmetic + badge
- [x] Leaderboard API endpoint `/marbles/api/leaderboard/top10` — JSON for embeds and chat commands

---

## Phase 8 — Map System

- [x] Map save/load in editor — Publish button (all users) posts to `POST /marbles/api/map/publish`; Load from library via Browse button modal + `GET /marbles/api/map/<id>`
- [x] Database table: `marble_maps` (map_id, name, author_login, description, map_data, piece_count, play_count, published_at)
- [x] Map browser page `/marbles/maps` — responsive card grid, search/filter by name/author/description, links to editor and leaderboard
- [x] `?load=<map_id>` URL param on editor — auto-loads map from library on page open (used by maps browser)
- [x] Map rating system (thumbs up/down, stored per Discord user per map)
- [x] Map thumbnail generation — canvas `toDataURL` capture at publish time; stored as base64 JPEG in DB; shown in maps browser and editor browse modal
- [x] Map versioning — keep old versions so leaderboard records remain valid
- [x] "Featured Maps" section curated by admin
- [x] Map tags (easy / medium / hard / loops / obstacle-heavy etc.)

---

## Phase 9 — Polish & Visual Effects

- [x] Sound effects using Web Audio API
  - [x] Marble rolling loop (pitch varies with speed)
  - [x] Collision thud (on contact event from cannon-es)
  - [x] Boost pad whoosh
  - [x] Bongo pad boing
  - [x] Laser zap
  - [x] Countdown beeps
  - [x] Finish fanfare
  - [x] Record broken jingle
- [x] Particle effects (Three.js instanced points or sprite sheets)
  - [x] Boost pad sparks
  - [x] Marble trail (fading colour streak behind each marble)
  - [x] Finish line confetti burst
  - [x] Bongo pad impact rings
- [x] Marble shadow (simple circle projected on nearest surface below)
- [x] Camera modes (toggle with key or button)
  - [x] Leader cam — chases the marble in 1st place, smooth lerp
  - [x] Overview cam — fixed isometric, shows full track
  - [x] Free cam — OrbitControls while race runs (desktop only)
  - [x] Follow specific marble — click a nametag to lock camera
- [x] "Last marble" drama mode — slow-mo when only one marble remains
- [x] Skybox / environment — simple gradient or HDRI (Three.js `PMREMGenerator`)
- [x] Track lighting — directional light casts soft shadows on track surface
- [x] Anti-aliasing — Three.js MSAA (built-in via `antialias: true`)

---

## Phase 10 — Advanced Game Modes

- [x] **Tournament mode** — series of 3–5 races, points accumulate, winner crowned at end; single session flow
- [x] **Team mode** — players auto-split into Red/Blue; team color tint on marbles; team score HUD strip; team winner banner in results
- [x] **Handicap mode** — trailing marbles (bottom 50% of pack) receive a forward force proportional to rank deficit and configurable strength (Mild/Normal/Strong/Extreme)
- [x] **Elimination mode** — last marble to finish each round is eliminated; continues until 1 remains
- [x] **Time Trial** — single-player or small-group, race against the track record ghost marble
- [x] **Ghost marble** — replay the track record run as a transparent "ghost" marble alongside live race
- [ ] **Relay race** — two teams, each team marble passes a baton at a relay piece; first team with all members through wins
- [x] **Gauntlet mode** — obstacle-only map, marbles that get hit by obstacles are eliminated

---

## Phase 11 — Twitch Integration Enhancements

- [ ] Channel Points redemption trigger — viewer redeems points to join mid-race (if lobby allows late joins)
- [ ] Prediction integration — auto-create a Twitch Prediction when race starts, resolve on winner (requires OAuth with `channel:manage:predictions`)
- [x] Chat overlay on play page — Twitch chat displayed alongside track (small scrolling panel, OBS-mode hides it)
- [ ] Clip trigger — auto-generate a Twitch clip at finish line moments (requires `clips:edit` scope)
- [x] `!score` command — CubAssist responds in chat with caller's rank, points, and coin balance
- [x] `!leaderboard` command — posts top 3 by points to chat (30s cooldown per channel)
- [x] `!record` command — posts track record for current map (or most recent) to chat

---

## Phase 12 — Streamer Dashboard

- [x] Marbles section in PM2 admin dashboard — shows active sessions, player counts, IRC connection status
- [x] Session management panel — force-end sessions, kick players, view live player list from admin dashboard
- [x] Map manager — publish/unpublish/delete maps, set featured maps, manage ratings
- [x] Leaderboard admin — reset records, ban players from leaderboard, manage seasons
- [x] Race history viewer — browse past races, view results, download race data as CSV

---

## Phase 13 — Mobile & Accessibility

- [x] Mobile-friendly results page (large touch targets, swipe to dismiss)
- [x] QR code on lobby screen — viewers can scan to check leaderboard on phone while watching stream
- [x] Reduced-motion mode (disables particles and camera shake)
- [x] High-contrast marble colour option (ensures colourblind-friendly palettes)
- [x] Screen-reader-friendly results table (proper `<table>` with `aria` labels)

---

## Phase 14 — Coins & Chat Abilities

> **Coins** are the spendable in-game currency. Earned from racing, spent on abilities during races and cosmetics in the shop. Coins do **not** affect leaderboard rank — that's what points are for.

- [x] **Coin economy** — earned from every race, never expire, stored on player account
  - [x] Earn rates: 1st = 100 · 2nd = 75 · 3rd = 60 · 4th = 50 · 5th = 40 · 6th–10th = 25 · 11th+ = 10 · DNF = 5
  - [x] Bonus coins: new track record +50 · clean race (0 respawns) +20 · photo finish +15 · win streak milestone ×2 multiplier
  - [x] Twitch VIP: +10% coin earn · Subscriber: +25% coin earn
  - [x] Coin balance shown on player profile and in `!score` chat command (shows both coins AND points)
  - [x] `marble_players.coins` column (spendable balance, decreases on purchase)
  - [x] `marble_players.coins_earned_total` column (all-time earned, never decreases — for leaderboard flex tab)
  - [x] `marble_coin_log` table (twitch_username, amount, reason, race_id, timestamp)
  - [x] `/marbles/api/player/<username>/coins` — GET balance · Admin POST to adjust
- [x] **Chat Abilities** — viewers spend their coins in Twitch chat during an active race; streamer enables/disables per session
  - [x] Abilities triggered by: `!ability <name> [@target]` in Twitch chat
  - [x] IRC reader parses ability commands and queues them; play.js polls `/marbles/api/game/<id>/abilities` every 1s
  - [x] Coin deducted immediately on valid command; refunded if ability fails (target already finished, invalid target, etc.)
  - [x] **Buff abilities** (help your own marble):
    - [x] **Speed Burst** (50 coins) — +50% velocity for 3 seconds on caller's marble
    - [x] **Shield** (80 coins) — immune to hostile abilities for 5 seconds; golden glow indicator
    - [x] **Mega Bounce** (60 coins) — restitution ×5 for 3 seconds; useful on bouncy sections
    - [x] **Ghost Mode** (100 coins) — passes through other marbles (no marble-marble collision) for 4 seconds
    - [x] **Shrink** (40 coins) — −30% mass (goes faster, less affected by obstacles) for 5 seconds
    - [x] **Jump** (35 coins) — one-time large upward impulse; useful to skip an obstacle
    - [x] **Sticky Wheels** (45 coins) — high friction for 3 seconds; marble grips track, won't slide off
  - [x] **Sabotage abilities** (target another player's marble — streamer can disable sabotage):
    - [x] **Freeze** (70 coins) — target frozen in place 1.5 seconds
    - [x] **Ice Blast** (50 coins) — target gets near-zero friction for 2 seconds (slides off course)
    - [x] **Teleport Home** (65 coins) — target sent back to start
    - [x] **Swap** (120 coins) — swap caller's marble position with target's position
    - [x] **Earthquake** (80 coins) — random velocity impulses hit target for 2 seconds
    - [x] **Magnet** (70 coins) — pulls target marble toward a random wall for 2 seconds
    - [x] **Reverse** (75 coins) — reverses target's velocity for 1 second
    - [x] **Gravity Flip** (90 coins) — flips gravity for target marble only for 2 seconds
    - [x] **Glue** (55 coins) — target marble stuck in place 1 second then released
    - [x] **Size Up** (60 coins) — target marble ×2 scale visually and +100% mass for 5 seconds
  - [x] **Global abilities** (affect all marbles, cost more):
    - [x] **Global Earthquake** (200 coins) — all marbles get random impulses for 1.5 seconds
    - [x] **Global Gravity Flip** (250 coins) — all marbles reverse gravity for 2 seconds
    - [x] **Chaos** (300 coins) — random ability applied to every marble simultaneously
    - [x] **Speed Boost All** (180 coins) — all marbles get +30% velocity for 2 seconds
    - [x] **Double Coins Next Race** (400 coins) — next race all players earn 2× coins
  - [x] Ability queue: max 3 active effects per marble simultaneously; older effects get cancelled if full
  - [x] Ability HUD: icon bar above each affected marble (DOM screen-space projection)
  - [x] Ability log panel in OBS control panel: shows last 10 abilities fired with who triggered them and cost
- [x] **Coin shop** `/marbles/shop` — buy skins, trails, accessories with coins; owned/balance display, buy button, toast feedback
  - [x] Buy cosmetic skins, trails, accessories with coins
  - [ ] Buy ability upgrades (e.g. Speed Burst lasts 5s instead of 3s for 500 coins permanent upgrade)
  - [ ] Buy title/flair badges (shown next to name in results: "The Unstoppable", "Coin Hoarder" etc.)
  - [ ] Daily deals — 3 random cosmetics at 20% discount, resets at midnight
  - [ ] Bundle packs (e.g. "Starter Pack" — 3 skins + 1 trail for 500 coins)

---

## Phase 15 — Player Settings & Preferences

- [x] Player settings page `/marbles/settings` — each player configures their race experience
  - [x] **Display name** — override Twitch username display (capped 20 chars)
  - [x] **Preferred marble colour** — manual colour picker overrides username-hash colour
  - [x] **Nametag style** — Default / Bold / Minimalist (name only) / Hidden (competitive mode)
  - [x] **Trail preference** — managed via `/marbles/cosmetics` equip page (trail equip)
  - [x] **Sound volume** — slider 0–100% for all in-race sounds (master gain node in SFX module)
  - [x] **Sound pack** — choose from unlocked sound packs (Classic / Retro 8-bit / Satisfying) — stored in settings; pack renderer in play.js is future work
  - [x] **Marble size** — cosmetic scale (0.8×, 1.0× default, 1.2×, 1.4×) — stored in settings, applied in play.js at spawn
  - [x] **Camera preference** — default cam mode when joining a spectated race (Leader / Overview / Free)
  - [x] **Reduced motion** — disables particles, trails, camera shake, slow-mo effects
  - [x] **High contrast names** — forces white nametag text regardless of marble colour
  - [x] **Notifications** — toggle: achievement notifications, record broken alerts, coin earned popups
  - [ ] **Language** — UI language (English, Spanish, French, Portuguese, German, Japanese — community-translated)
  - [x] **Timezone** — stored in settings
  - [x] **Privacy** — toggle: show profile publicly, show in leaderboards
  - [ ] **Linked accounts** — show Discord + Twitch link status, link/unlink buttons
  - [x] Settings stored in `marble_player_settings` DB table
  - [x] Settings apply immediately to next race (no restart needed)

---

## Phase 16 — 20 New Track Pieces

> Add to piece catalog in `editor.js`, add visual mesh builder, add collider to `colliderBuilder.js`, register effects in `play.js`

- [x] **Wide Straight** (w:8, d:16) — double-width track; allows side-by-side racing
- [x] **Narrow Straight** (w:2, d:16) — single-marble-width choke point
- [x] **S-Curve** — sinusoidal snake path; entry and exit aligned on same axis; marble weaves side to side
- [x] **Crossroads** — two straight tracks crossing at 90°; marbles can collide from 4 directions
- [x] **Split Track** — one entry, two exits; marble takes the left or right path based on momentum
- [x] **Merge Track** — two entries, one exit; funnel shape
- [x] **Corkscrew** — full 360° horizontal spiral (like a helix ramp); marble spirals downward
- [x] **Bank Turn Left / Bank Turn Right** — corner with a banked (angled, 20°) surface so marbles don't fly off at speed
- [x] **Vertical Drop** — steep 65° ramp straight down; marble free-falls then lands on a catch pad
- [x] **Staircase** — 5-step staircase; marble bounces down each step (each step = angled flat box)
- [x] **Half-Pipe** — U-shaped track; marble rocks side-to-side (like a skateboard half-pipe)
- [x] **Tube Curve** — enclosed pipe that turns 90° left or right; BackSide+FrontSide mesh gives dark enclosed look
- [x] **Drawbridge** — bridge that starts vertical (blocking) and opens flat after 3 seconds (kinematic animation)
- [x] **Catapult Launch** — kinematic platform that fires marble upward every 5s with a rapid 3-unit launch
- [x] **Wall Jump** — two parallel walls close together; marble bounces between them gaining height
- [x] **Ramp Spiral** — ascending helix (360°, parking-garage style); marble spirals upward one full turn
- [x] **Diving Board** — long narrow beam that wobbles sinusoidally; marble rides the wave
- [x] **Bowl** — hemispherical bowl; marble rolls around inside with 8 angled panels
- [x] **Pinball Lane** — straight section flanked by 8 bouncy bumpers in two rows; marble slaloms through
- [x] **Finish Ramp** — wide ramp leading into the finish zone, with raised side-walls that funnel marbles to the centre; makes finishes dramatic

---

## Phase 17 — 50 More Obstacles & Effects

> Each obstacle needs: editor piece entry, visual mesh, collider in `colliderBuilder.js`, and tick logic in `play.js`

**Physics-based hazards**
- [ ] **Wrecking Ball** — large sphere on a chain, swings on a kinematic pendulum arc across the track
- [ ] **Rolling Boulder** — non-static sphere body that slowly rolls down the track and knocks marbles aside; respawns at top on loop
- [ ] **Spinning Blade** — flat disc rotating rapidly in the horizontal plane; contact launches marbles sideways
- [ ] **Piston** — box that repeatedly extends and retracts vertically; crushes marbles briefly against the ceiling then releases
- [ ] **Flipper** — pinball-style flipper; kinematic rotation triggered on a timer; smacks marbles off course
- [ ] **Tilt Platform** — platform that tilts left/right on a timer; marbles slide to one side
- [ ] **See-Saw** — two-ended platform; weight of marbles causes it to tilt dynamically (needs mass-based kinematic)
- [ ] **Spinning Top** — cone-shaped kinematic body rotating very fast; any marble touching it gets flung radially
- [ ] **Gate Blocker** — door that opens/closes on a timer; marbles must time their approach
- [ ] **Catapult Arm** — large arm swings 180° and launches any marble that lands on the scoop

**Gravity & force fields**
- [ ] **Vortex** — cylindrical zone; applies a spinning tangential force + inward force; marbles orbit then get sucked to centre
- [ ] **Repulsor Field** — zone that pushes all marbles away from its centre (opposite of magnet)
- [ ] **Gravity Well** — zone where gravity increases to 5× normal; marbles fall faster through it
- [ ] **Zero G Corridor** — enclosed tunnel section with no gravity; marbles float and drift
- [ ] **Sideways Gravity Strip** — floor section where gravity points sideways instead of down; marble runs along a wall
- [ ] **Upward Current** — column of rising air; marble enters from below and is gently lifted upward
- [ ] **Turbulence Zone** — zone that applies random small forces every frame; marble path becomes unpredictable
- [ ] **Magnetic Rail** — thin rail; marbles within 0.5 units are guided along it like a track groove
- [ ] **Tractor Beam** — directed force pulling marbles along a specific vector regardless of gravity
- [ ] **Gravity Inverter Strip** — short pad that sets marble's gravity to +35 (up) for 2 seconds; marble flies upward

**Fire & energy hazards**
- [ ] **Flame Jet** — periodically shoots a column of fire perpendicular to track; contact sends marble flying upward
- [ ] **Electric Arc** — two pillars with an arc of electricity between them; contact freezes marble for 1.5 seconds
- [ ] **Plasma Ring** — ring of energy that pulses outward; marbles caught in the pulse ring get blasted outward
- [ ] **Lava Pit** — red glowing pit; marbles that fall in are teleported back 1 checkpoint (destroyed/respawned)
- [ ] **Freeze Ray** — beam rotating slowly; contact applies high damping and linear drag for 2 seconds
- [ ] **Smoke Screen** — area where nametags and marble outlines are hidden; players lose visual tracking
- [ ] **EMP Burst** — periodically disables all boost pads and active abilities within radius for 3 seconds
- [ ] **Acid Pool** — marble that enters loses 1 coin per second of contact (economic hazard)
- [ ] **Laser Grid** — horizontal grid of crossing laser beams that move up and down; marbles must time passing under
- [ ] **Flashbang** — emits a white flash that temporarily whites out the screen for spectators; no physics effect

**Structural & track hazards**
- [ ] **Collapsing Floor** — floor tile that breaks away 1 second after a marble lands on it; non-static body falls away
- [ ] **Trapdoor** — hinged floor section that opens when a marble steps on it; kinematic hinge drops open
- [ ] **Moving Wall** — wall that slides back and forth across the track; marbles must find the gap
- [ ] **Shrinking Corridor** — two walls that slowly move inward over 10 seconds; if marble gets squeezed it's ejected
- [ ] **Rotating Floor** — circular platform that spins; marble rolls in a spiral if it stands on it
- [ ] **Glass Floor** — transparent floor with holes; some squares are solid, some are not (randomised each race)
- [ ] **Seesaw Bridge** — bridge made of two planks; weight of marbles causes the bridge to tilt
- [ ] **Bouncy Castle** — room filled with low-restitution bumpers in a random arrangement; marble bounces chaotically through
- [ ] **Obstacle Gauntlet** — pre-built section of 5 sequential hazards in a tight corridor; all activate simultaneously
- [ ] **Flip Zone** — floor section that flips upside-down on a timer; marbles standing on it fall when it inverts

**Power-up pickups**
- [ ] **Speed Orb** — floating pickup marble rolls over to collect; gives 2-second speed burst (like a boost pad but moveable)
- [ ] **Shield Orb** — makes marble immune to next obstacle hit; collected like speed orb
- [ ] **Coin Multiplier Orb** — doubles coins earned in this race if collected (1 per race, first come first served)
- [ ] **Weight Orb** — increases marble mass temporarily; pushes other marbles aside more aggressively
- [ ] **Jump Pad Orb** — collected marble gets a massive upward boost on next track contact

**Environmental / weather**
- [ ] **Wind Gust** — track section where a powerful lateral force randomly flips direction every 2 seconds
- [ ] **Rain Effect** — visual only; particles fall from above; floor friction increases slightly (wet track)
- [ ] **Ice Storm** — like Rain but particles are white; floor friction drops to near zero (ice track)
- [ ] **Fog Zone** — visual only in OBS mode; dense fog reduces nametag visibility to 2 units
- [ ] **Sandstorm** — constant weak horizontal force changes direction every 3 seconds; marbles drift unpredictably

---

## Phase 18 — Marble Customisation & Cosmetics

**Marble Skins (25 total)**
- [x] Solid colour · Striped · Polka Dot · Checker · Swirl · Galaxy · Nebula · Lava · Ice · Ocean · Forest · Gold · Silver · Diamond · Obsidian · Holographic · Neon · Rainbow · Country Flag · Emoji · Transparent · Fire · Void · Pizza · Minecraft Dirt
- [x] Canvas texture builder — generate skin texture procedurally in a `<canvas>` at load time
- [ ] Shader-based skins (Swirl, Galaxy, Lava, Holographic) use `ShaderMaterial` with custom GLSL UV animation (currently canvas-based; upgrade later)

**Marble Trails (15 total)**
- [x] Catalogue defined: Sparkle · Fire · Rainbow · Smoke · Lightning · Hearts · Stars · Bubbles · Money · Cherry Blossom · Dark Matter · Ice Crystals · Lava Drip · Electric · DNA
- [x] Trail renderer: custom particle burst per trail type (sparkle/fire/rainbow/smoke/lightning/hearts/stars/bubbles/money/cherry_blossom/dark_matter/ice_crystals/lava_drip/electric/dna)

**Marble Accessories (7 total)**
- [x] Catalogue defined: Crown · Halo · Party Hat · Bow · Propeller Hat · Wings · Sunglasses
- [x] 3D mesh accessories rendered above marble in play.js (crown/halo/party_hat/bow/propeller/wings/sunglasses)

**Unlock & Equip System**
- [x] Milestone unlocks (wins, races, points, achievements, season finish) — auto-triggered after every race
- [ ] Coin shop purchases (`/marbles/shop`)
- [ ] Event-exclusive and tournament-winner cosmetics
- [x] Equip page `/marbles/cosmetics` — procedural preview ball, click to equip
- [x] DB: `marble_cosmetics` (unlocked_skins JSON, unlocked_trails JSON, unlocked_accessories JSON, equipped_*)
- [x] Streamer session toggle: `cosmetics_enabled` flag; play.js respects it

---

## Phase 19 — Achievements & Badges (50+)

- [x] Achievement engine — evaluate conditions after every race, award on first trigger
- [x] Badge display on player profile and in-race nametag (small icon under name)
- [ ] Achievement list:
  - [x] **First Steps** — complete your first race
  - [x] **Podium Finish** — finish in top 3
  - [x] **Champion** — win a race (1st place)
  - [x] **Hat Trick** — win 3 races in a row
  - [x] **Unstoppable** — win 10 races in a row
  - [x] **Century** — play 100 races
  - [x] **Speed Demon** — set a track record
  - [x] **Untouchable** — win a race without any respawns
  - [x] **Comeback Kid** — win after being in last place at the halfway point
  - [x] **Participant Award** — finish last in a race with 20+ players (secret)
  - [ ] **Survivor** — complete a race on a map with all obstacle types active
  - [x] **Night Owl** — play a race between midnight and 4am (server local time)
  - [x] **The Long Game** — complete a race that lasted over 5 minutes
  - [x] **Veteran** — play 500 races
  - [x] **Legend** — accumulate 1000 total points
  - [ ] **Ghost Buster** — beat the track record ghost marble
  - [ ] **Social Butterfly** — play on 10 different streamers' channels
  - [x] **Map Explorer** — finish a race on 25 different maps
  - [x] **Season Champion** — finish #1 on a season leaderboard
- [x] Secret/hidden achievements (not shown until unlocked)
- [x] Achievement notification overlay during race — small banner slides in bottom-left
- [x] Achievement feed in chat via CubAssist (`!achievements` to list, auto-post on unlock)

---

## Phase 20 — Race Replay & Spectator System

- [ ] **Race replay recording** — store physics keyframes (position + rotation of each marble) every 100ms server-side or compress to spline on client
  - [ ] Replay storage: `marble_replays` table (race_id, map_id, compressed_data BLOB, duration_ms, player_count)
  - [ ] Replay viewer page `/marbles/replay/<race_id>` — play back a past race at 1x/2x/0.5x speed
  - [ ] Scrub bar — seek to any point in the replay
  - [ ] "Watch" button on race history page links to replay
  - [ ] Replay export as GIF or WebM (canvas capture via `MediaRecorder` API)
- [ ] **Live spectator mode** — watch an ongoing race without being a player
  - [ ] `/marbles/watch/<session_id>` — spectator URL, shareable link
  - [ ] Spectators see the same play page in read-only mode (no lobby UI)
  - [ ] Live viewer count shown on spectator page and in editor lobby panel
  - [ ] Spectators can vote for their favourite marble (heart icon floats up from their choice)
  - [ ] Spectator vote tally shown as a small crowd cheer indicator beside marble nametag
- [ ] **Highlight reel** — auto-detect dramatic moments and clip them
  - [ ] Trigger: marble in last place overtakes 3+ positions in 5 seconds
  - [ ] Trigger: lead change in the final 10% of the track
  - [ ] Trigger: two marbles cross finish within 0.5 seconds of each other (photo finish)
  - [ ] Photo finish overlay — slow-mo camera, "PHOTO FINISH" text, frame-by-frame advance
  - [ ] Highlight clips stored and viewable from race history

---

## Phase 21 — Social & Community Features

- [ ] **Player-to-player challenges** — `/marbles/challenge/<username>` — send a 1v1 race challenge, both players join same lobby
- [ ] **Friends list** — link Discord account and follow Twitch usernames; see friends' recent races and stats
- [x] **Rival system** — auto-detect your closest competitor (similar points, frequent shared races); shown on profile as "Rival: @username"
- [x] **Public player search** `/marbles/player/search?q=username` — find any player's profile
- [ ] **Race sharing** — shareable results card image (generated server-side with Pillow/PIL): race name, top 3 podium, map name, date
- [ ] **Community maps page** — players can submit, rate, and comment on maps; most liked shown on homepage
- [ ] **Map collections / playlists** — group multiple maps into a playlist for consecutive-race tournament nights
- [x] **Marble of the Week** — automated pick based on most wins that week; displayed on leaderboard homepage with a trophy
- [x] **Discord integration** — optional webhook: post race results to a Discord channel after each race (embed with top 3, map name, total players)
- [x] **Stream alert integration** — trigger OBS browser source alert overlay when a record is broken or achievement unlocked

---

## Phase 22 — Session Settings & Race Config

> Streamer configures these in the Game tab of the editor before opening the lobby

- [x] **Fall-off mode** toggle — `Respawn` (default) vs `Elimination`
  - [x] **Respawn**: marble teleports back to last checkpoint / start with a time penalty; continues racing
  - [x] **Elimination**: marble that falls off is out of the race immediately; body removed from world; name shown as "❌ Eliminated" in leaderboard; player must wait for next race
  - [x] Elimination mode: show live eliminated count in HUD ("12 eliminated, 8 racing")
  - [x] Elimination mode: when only 1 marble remains it is automatically declared the winner
  - [x] Server stores `fall_mode` on `MarbleSession`; play page reads it and branches fall-off logic
- [x] **Max respawns** — configurable limit per marble (e.g. 3); on 3rd fall the marble is eliminated even in Respawn mode
- [x] **Race timeout** — configurable 1 / 2 / 3 / 5 / 10 minutes (default 3 min)
- [x] **Max players** — already supported (editor field), but add presets: 16 / 32 / 50 / 100 / 200
- [x] **Late join** toggle — allow viewers to `!join` after lobby is closed but race hasn't started yet
- [x] **Spectator join** — allow viewers to watch a live race via `/marbles/watch/<session_id>` link generated in the lobby
- [x] **Coin multiplier** for this session — streamer can set 2× or 3× coins for special stream events
- [x] **Abilities enabled** toggle — master switch to allow/disallow viewer coin abilities during this race
- [x] **Cosmetics enabled** toggle — show player skins/trails or enforce uniform marbles
- [x] **Gravity setting** — Normal / Low (moon) / High (heavy) — adjustable by streamer
- [x] **Marble friction** — Low / Normal / High — affects how grippy track surface is globally
- [x] **Camera lock** — force all spectators and OBS to a specific camera mode (streamer choice)
- [x] **Announce winner in chat** — CubAssist posts winner to Twitch chat automatically on race end

---

## Phase 23 — Map Editor Enhancements (expanded)

- [x] **Undo/redo stack** — Ctrl+Z / Ctrl+Y for place and delete actions (up to 50 deep)
- [x] **Grid snapping** — pieces snap to configurable grid (0.5 / 1 / 2 / 4 unit; toggle off for free placement)
- [x] **Multi-select** — hold Shift+click to select multiple pieces; move/delete/rotate group
- [x] **Copy/paste** — Ctrl+C / Ctrl+V; duplicates selected pieces with +4 unit Z offset
- [x] **Mirror tool** — flip selection horizontally or vertically around selection centre
- [x] **Auto-connect** — smart snap to nearest compatible piece endpoint when placing
- [x] **Track validator** — warn if: no start piece, no finish piece, track has no path from start → finish, floating pieces (Y gap > 2 units from any other piece)
- [x] **Piece search** — filter sidebar piece list by typing (e.g. "corner", "boost")
- [x] **Custom piece colours** — colour picker per placed piece overrides default
- [x] **Loop shortcut detection** — warn if loop exit gap allows marbles to skip it
- [x] **Preview race** — solo simulation inside editor (1 marble, no players) to test the map
- [x] **Map statistics panel** — piece count by type, total estimated length, max height, height drop, piece variety score
- [x] **Piece notes** — attach a text annotation to any piece (shown as tooltip on hover in editor, hidden in race)
- [x] **Camera bookmarks** — save up to 5 camera positions with keyboard shortcuts (Shift+1–5 to jump to them)
- [x] **Piece lock** — lock individual pieces so they can't be accidentally moved/deleted
- [x] **Group/ungroup** — group a set of pieces and move/rotate them as a unit
- [x] **Height ruler** — visual dashed line from selected piece down to Y=0 showing placement height
- [x] **Auto-height** — button to drop all floating pieces to the nearest surface below them
- [x] **Track waypoints** — place invisible waypoints along the intended route; used by analytics heatmap and progress tracking
- [x] **Dark / light editor theme** toggle — CSS class toggle, persisted in localStorage
- [x] **Minimap** — small 2D top-down thumbnail of the track in the corner of the editor
- [x] **Auto-save** — save map to localStorage every 60 seconds; recovery toast if unsaved work detected on load
- [x] **Map import from URL** — paste a map share URL or ID to load it directly into editor
- [x] **Random map generator** — generate a random valid map (procedural: place start, N straights, corners, ramps, finish) as a starting point

---

## Phase 23b — 3D Piece Mesh Quality

> Track pieces should look like open-channel marble run pieces (visible floor + raised side walls, "U" cross-section) — inspired by Marbles on Stream visual style

- [x] **Bowl** — replaced 8 flat box panels with smooth LatheGeometry parabolic bowl (inner + outer surface with wall thickness)
- [x] **Funnel** — replaced box fallback with 4 trapezoidal walls (wide top → narrow bottom) + rim frame
- [x] **Loop** — replaced closed full-circle tube with open-arc TubeGeometry (~320°) + tangential entry and exit legs; marble can now enter and exit the loop
- [ ] **Open-channel tube conversion** — convert all TubeGeometry-based pieces (straight, corner, ramp, s_curve, corkscrew, etc.) from enclosed round pipe to open-top U-channel cross-section matching Marbles on Stream style
- [ ] **Track bottoms** — ensure all platform-style pieces have visible undersides (bottom face on all box-based floor pieces)
- [ ] **Merge track / Split track** — improve wall connections at the split/merge junction (wedge geometry instead of box divider)
- [ ] **Bridge** — replace 3 angled flat boxes with a proper arched bridge mesh with side rails
- [ ] **Corkscrew** — add side walls to the helix path so it looks like a channel, not a bare tube
- [ ] **Ramp spiral** — add side walls matching the helix angle
- [ ] **Piece LOD** — high-detail mesh in editor, low-poly collider in play (avoids physics overhead)

---

## Phase 24 — 80 More Track Pieces

> Each piece needs: catalog entry (id, w/d/h, color, defaultProps), visual mesh builder, physics collider

**Straight Variants**
- [ ] Straight Short (d:4) — quarter-length straight for tight turns
- [ ] Straight Long (d:32) — double-length straight for speed runs
- [ ] Straight XL (d:64) — very long drag-strip straight
- [ ] Straight Wide (w:8) — double-width lane, supports 2 marbles side-by-side
- [ ] Straight Narrow (w:2) — single-marble squeeze lane
- [ ] Straight Raised (w:4, d:16, elevated) — same as straight but sits higher for underpasses
- [ ] Camber Straight Left — floor tilted 10° left; marbles drift toward left wall
- [ ] Camber Straight Right — floor tilted 10° right
- [ ] Wavy Straight — floor has 3 gentle bumps along its length (sinusoidal profile)
- [ ] Textured Grip Straight — high friction surface (rubber material); marble slows but won't slide

**Corner Variants**
- [ ] Corner 45° Left / Right — shallower 45° arc instead of 90°
- [ ] Corner 180° U-Turn — full 180° hairpin; marble reverses direction
- [ ] Corner Wide Left / Right — larger radius corner (radius:14) for high-speed sections
- [ ] Corner Tight Left / Right — small radius (radius:4) for tight technical maps
- [ ] Banked Corner Left / Right — 90° corner with floor tilted 15° inward; marble stays in lane at speed
- [ ] Elevated Corner — corner piece at height +6; for flyover intersections
- [ ] Underground Corner — corner piece at height −4; for tunnel systems

**Ramp Variants**
- [ ] Ramp Steep Up / Down (angle:30°) — steeper ramp for more dramatic drops
- [ ] Ramp Gentle Up / Down (angle:5°) — very gradual slope
- [ ] Ramp Wide Up / Down (w:8) — wide ramp fits multiple marbles
- [ ] Ramp Curved — ramp that curves slightly left/right as it ascends
- [ ] Ramp with Walls (closed ramp) — high side walls prevent rolling off at speed
- [ ] Ski Jump — ramp angled upward that launches marble airborne with a boost impulse at the lip
- [ ] Landing Pad — flat wide pad with high damping, for after ski jumps
- [ ] Double Ramp — two parallel ramps side by side

**Loop Variants**
- [ ] Loop Horizontal — like a standard loop but rotated 90° (sideways corkscrew)
- [ ] Loop Wide (radius:6) — bigger loop requiring more speed
- [ ] Loop Tight (radius:2) — tiny loop, very hard to maintain speed through
- [ ] Double Loop — two full loops in sequence on the same piece
- [ ] Inverted Loop — loop that exits upside-down (requires gravity flip zone after)
- [ ] Corkscrew 360° — horizontal spiral descending one full turn
- [ ] Corkscrew 540° — 1.5-turn descending spiral
- [ ] Helix Tower — 3-turn descending helix around a central column

**Specialty Track Sections**
- [ ] Half-Pipe Short — shallow U-profile, width:12, depth:4; marble rocks side to side
- [ ] Half-Pipe Long — d:24 half-pipe for extended side-to-side travel
- [ ] Pipe Straight — fully enclosed cylindrical tunnel (hex prism), d:16
- [ ] Pipe Elbow — enclosed 90° pipe turn
- [ ] Pipe T-Junction — three-way enclosed pipe split
- [ ] Pipe Y-Junction — 45° fork in enclosed pipe
- [ ] Slide — open channel (no roof), u-shaped cross-section, angled 20° down
- [ ] Chute — enclosed tube with angled descent; marble gains speed
- [ ] Bowl — hemispherical pit, marbles roll in circles then exit via small hole
- [ ] Dish — shallow bowl, wide catch area with centre exit
- [ ] Half-Sphere Ramp — dome-shaped ramp marble rolls up and over
- [ ] Pinball Lane — straight section flanked by 8 bumpers in two rows
- [ ] Crossroads — two straights crossing at 90°; marbles can collide from 4 directions
- [ ] Crossroads 45° — diagonal crossing at 45°
- [ ] Split Track — 1 entrance, 2 exits; marble takes left/right based on initial position
- [ ] Merge Track — 2 entrances, 1 exit; funnel
- [ ] Drawbridge — bridge that starts closed and opens after 3 seconds
- [ ] Retractable Platform — platform that retracts into wall on a timer

**Elevated & Structural**
- [ ] Overpass — straight piece elevated +8 units with support columns
- [ ] Underpass — straight piece that goes underground (floor at −4, ceiling at +2)
- [ ] Flyover Crossing — overpass that crosses over another piece; pieces connect vertically
- [ ] Suspension Bridge — long span (d:32) held by visual cables; slight spring physics on floor
- [ ] Spiral Tower Up — marble spirals up around a cylinder on the outside
- [ ] Spiral Tower Down — marble spirals down around a cylinder
- [ ] Vertical Shaft — narrow tube going straight down; marble free-falls
- [ ] Launch Tube — narrow vertical shaft going up; strong boost at bottom fires marble up

**Special Surfaces**
- [ ] Ice Straight — straight with near-zero friction material
- [ ] Mud Straight — straight with very high friction / low restitution
- [ ] Lava Straight — lethal surface (acts as elimination zone in Elimination mode)
- [ ] Bouncy Straight — bongo material; marble bounces repeatedly while rolling
- [ ] Magnetic Straight — marble guided along a centre groove by simulated magnetic rail
- [ ] Sticky Straight — marble dramatically slows to near-stop then releases
- [ ] Sand Trap — wide slow zone; marble bogs down (high friction, zero restitution)
- [ ] Wet Concrete — medium friction, slight sideways drift
- [ ] Rubber Straight — very high restitution; lateral collisions send marbles sideways

**Finish Line Variants**
- [ ] Finish Funnel — wide funnel that narrows to a single marble finish point; dramatic bottleneck
- [ ] Finish Ramp — steep downward ramp into finish zone; all marbles pile in from above
- [ ] Finish Arch — tall archway finish gate with celebratory design
- [ ] Finish Platform — elevated circular podium; marbles jump up to finish
- [ ] Multi-Finish — track splits into 5 parallel finish lanes; each lane is a separate finish trigger

**Start Piece Variants**
- [ ] Start Wide (w:12) — wide start platform for 100-player races
- [ ] Start Elevated — start platform at height +10; marble drops down to the track
- [ ] Grid Start — 8 individual starting boxes arranged in 2 rows of 4; marbles lined up race-car style
- [ ] Rolling Start — marbles pre-placed on a slow-moving conveyor; race begins when conveyor stops

**Decorative (visual only, no collider)**
- [ ] Crowd Stands — large grandstand meshes flanking the track (purely visual)
- [ ] Finish Banner — archway with finish text texture (visual only)
- [ ] Sponsorship Board — flat plane with custom texture (streamer name etc.)
- [ ] Glowing Track Edge — bright emissive trim applied to existing straight pieces
- [ ] Animated Finish Confetti Emitter — particle emitter piece placed at finish zone

---

## Phase 25 — 100 More Obstacles & Effects

> Each needs: editor entry, visual mesh, optional collider, tick logic in play.js

**Spinning & Rotating**
- [ ] Spinning Cross — 4-arm kinematic cross rotating in horizontal plane
- [ ] Spinning Wheel — large vertical wheel; marbles hit spokes and bounce
- [ ] Triple Hammer — 3 hammers at 120° intervals on one rotating arm
- [ ] Propeller Fan — large horizontal propeller blowing marbles forward/backward
- [ ] Turntable — flat circular rotating platform; marble placed on it spins with it
- [ ] Gyroscope — sphere that spins and wobbles; collision sends marble in unpredictable direction
- [ ] Rotor Blade — single long thin arm sweeping close to track surface
- [ ] Carousel — ring of 6 arms extending from centre, sweeping at low height
- [ ] Pinwheel — small fast-spinning 4-blade windmill; lightweight hit deflects marbles
- [ ] Gears — interlocking gear meshes rotating in opposite directions; marbles caught in teeth bounce

**Projectile Hazards**
- [ ] Cannon Ball — large kinematic sphere shot across the track on a timer; impacts send marbles flying
- [ ] Dart Gun — fires small fast spheres horizontally across track every 2 seconds
- [ ] Homing Missile — slow-moving sphere that gently curves toward nearest marble (weak force)
- [ ] Air Strike — random zones on track receive downward impulse bursts (invisible bombs)
- [ ] Bowling Ball — heavy sphere that rolls slowly down the track, sweeping marbles aside
- [ ] Wrecking Ball Pendulum — large sphere on swinging arc; much larger radius than single hammer
- [ ] Chain Whip — a chain of 3 linked physics bodies rotating; outer end travels at high speed
- [ ] Throwing Arm — catapult-style arm that flings a payload sphere across the track
- [ ] Shockwave Emitter — sends outward ripple force from its centre every 3 seconds
- [ ] Mine — stationary sphere; any marble within 1 unit triggers an explosion force burst (one use, then disappears)

**Environmental Zones**
- [ ] Quicksand Zone — marble sinks slightly and slows; escapes with velocity maintained
- [ ] Jelly Zone — extremely high damping; marble feels like it's moving through jelly
- [ ] Bouncy Zone — all track surfaces in this zone have bongo material
- [ ] Speed Zone — constant forward force applied to all marbles inside; like a continuous boost strip
- [ ] Slow Zone — velocity scaled to 0.4× while marble is inside
- [ ] Anti-Gravity Column — cylindrical zone where gravity is 0; marble floats upward on entry
- [ ] Vortex Drain — strong downward + rotational force; marble spirals down a drain
- [ ] Air Jet Column — upward air column; marble hovers and drifts
- [ ] River Current — horizontal zone with one-directional flow force; like water current
- [ ] Pressure Wave Zone — alternating push/pull cycle every 0.5 seconds

**Traps & Timed Hazards**
- [ ] Bear Trap — snaps shut when marble is above it; pauses marble 1 second then releases
- [ ] Pressure Plate — activates a different obstacle when marble stands on it (linked trigger)
- [ ] Timer Bomb — counts down 5 seconds then explodes (shockwave force); resets
- [ ] Proximity Mine — explodes when marble within 0.8 units; single use
- [ ] Tripwire — thin beam across track; contact triggers a trap (linked to another obstacle)
- [ ] Swinging Gate — door that swings open/close rhythmically; marble must slip through gap
- [ ] Elevator Trap — platform rises then drops suddenly; marble gets launched or dropped
- [ ] Spring Trap — flat plate that suddenly launches marble upward
- [ ] Pit Trap — trapdoor that opens on contact; marble falls through into respawn/elimination
- [ ] Cage Drop — cage falls around marble, holds it 2 seconds, lifts

**Fire & Energy**
- [ ] Flamethrower — rotating stream of fire sweeping 360°; wide arc, slow rotation
- [ ] Lightning Rod — strikes ground in a small area every 3 seconds; contact freezes marble
- [ ] Energy Shield — transparent barrier that blocks marbles for 2s, then deactivates 1s
- [ ] Tesla Coil — arc of electricity to nearest marble within radius; chains to nearby marbles
- [ ] Plasma Cutter — horizontal beam sweeps back and forth; contact sends marble sideways
- [ ] Nuke — massive shockwave explosion affecting all marbles; long cooldown (30 seconds)
- [ ] EMP Tower — disables all ability effects within large radius for 5 seconds periodically
- [ ] Inferno Ring — ring of fire around a section; marbles must pass through (lava-like zone)
- [ ] Laser Fence — multiple parallel laser beams forming a fence; gaps open and close rhythmically
- [ ] Arc Reactor — pulses energy radially every 2 seconds; closer marbles hit harder

**Ice & Cold**
- [ ] Freeze Cannon — beam that freezes marble for 1.5 seconds; can be deflected by shield orb
- [ ] Blizzard Zone — combination of near-zero friction and lateral random forces
- [ ] Ice Block — large static cube of ice that shatters on first marble impact; falls in 3 pieces that act as new obstacles briefly
- [ ] Frost Trap — marble that enters is coated in ice visual; friction drops to 0.01 for 3 seconds
- [ ] Ice Wall — wall that breaks after 3 impacts; reforms after 10 seconds

**Water & Fluid**
- [ ] Geyser — upward water jet that fires every 4 seconds; strong upward impulse
- [ ] Waterfall — constant downward force zone; entering slows marble horizontally, pulls down
- [ ] Whirlpool — spinning force zone at water level; marble orbits then gets ejected
- [ ] Tidal Wave — large lateral force sweeping across track every 6 seconds
- [ ] Underwater Section — low gravity (buoyancy) zone, high drag, visual fog; marble floats slowly

**Structural Collapses**
- [ ] Crumbling Pillar — pillar falls toward track after 2 seconds; kinematic mesh
- [ ] Collapsing Bridge Section — 3-tile bridge with each tile falling 1 second after contact
- [ ] Avalanche — wall of cubes cascades down a slope; each cube is a small physics body
- [ ] Demolition Wall — wall of 9 blocks (3×3); each block is a separate physics body; marble punches through
- [ ] Domino Chain — row of 10 tiles that topple in sequence when first is hit

**Bizarre & Comedy**
- [ ] Giant Boot — kinematic boot swings across track and kicks marbles sideways (Monty Python style)
- [ ] Vacuum Cleaner — sucks marbles inward for 1 second then spits them out backwards
- [ ] Rubber Duck Zone — giant rubber ducks bounce around chaotically (kinematic random walk)
- [ ] Giant Magnet Drop — magnet picks up marble and holds it 1 second, drops it off-course
- [ ] Banana Peel — contact causes marble to spin wildly for 1 second; loss of directional control
- [ ] Anvil Drop — anvil falls straight down on random marble position; large impact force
- [ ] Bubble Trap — marble gets encased in a bubble, floats upward slowly, bubble pops after 2 seconds
- [ ] Disco Floor — floor tiles light up randomly; tiles that are lit deal bounce force on contact
- [ ] Spring Box — box that compresses and launches marble in a random direction
- [ ] Black Hole Bomb — black hole that expands from small to large over 3 seconds, then implodes

**Power-Ups (track pickups)**
- [ ] Speed Orb — 2-second speed burst
- [ ] Shield Orb — immune to next obstacle
- [ ] Coin Multiplier Orb — 2× coins this race
- [ ] Weight Orb — +50% mass for 5 seconds
- [ ] Jump Orb — massive upward impulse on next contact
- [ ] Magnet Orb — repels nearby marbles for 3 seconds
- [ ] Ghost Orb — passes through marbles for 4 seconds
- [ ] Freeze Orb — freezes nearest rival marble for 1.5 seconds
- [ ] Rewind Orb — teleports marble to position it was at 3 seconds ago (backward in time)
- [ ] Random Orb — applies a completely random effect from the ability list

**Weather & Atmosphere**
- [ ] Tornado — slow-moving vortex that wanders the track; sucks in marbles and flings them
- [ ] Storm Cloud — follows track section; applies random lightning strikes below it
- [ ] Heatwave — shimmering visual effect zone; marbles accelerate (reduced friction, heat updraft)
- [ ] Meteor Shower — random small spheres fall from above over 5 seconds on a large area
- [ ] Solar Wind — constant weak force in a single horizontal direction; subtle drift over time

---

## Phase 26 — Cosmetics: 50 More Skins, Trails & Accessories

**25 More Marble Skins**
- [ ] Aurora Borealis — animated green/purple ripple shader, semi-transparent
- [ ] Deep Sea — dark blue with bioluminescent speck animation
- [ ] Toxic — neon green with bubbling effect; dripping particles off marble
- [ ] Candy — bright pink/white swirl like a candy cane
- [ ] Caramel — warm amber with slow drip visual effect
- [ ] Watermelon — green outer, red inner gradient with seed spots
- [ ] Basketball — orange with black seam lines (canvas texture)
- [ ] Soccer Ball — black/white hex pattern (Adidas style)
- [ ] Tennis Ball — yellow-green with curved seam line
- [ ] Baseball — white with red stitching
- [ ] Camo — green/brown military camouflage pattern
- [ ] Tiger — orange with black stripe pattern
- [ ] Leopard — tan with dark rosette spots
- [ ] Dalmatian — white with random black dots
- [ ] Zebra — black/white alternating stripes
- [ ] Tie-Dye — rainbow spiral dye pattern
- [ ] Graffiti — spray-painted letter art texture
- [ ] Pixel Art — 8-bit pixel grid (like Minecraft wool textures)
- [ ] Glitch — corrupted texture with RGB split artefacts, occasional flicker
- [ ] Matrix — dark background with green falling characters (canvas shader)
- [ ] Universe — deep space photo texture (Hubble-style)
- [ ] Sunrise — gradient orange-to-pink with sun glow
- [ ] Stained Glass — segmented colour panels like cathedral glass
- [ ] Marble (stone) — realistic white marble stone texture (ironic marble-on-marble)
- [ ] Newspaper — greyscale newsprint texture with tiny readable text

**25 More Trails**
- [ ] Comet Tail — white/blue long streaking trail that fades
- [ ] Pollen — yellow dots drift off the marble like dandelion seeds
- [ ] Confetti — multicolour tiny squares scatter behind
- [ ] Ink Splatter — black/dark blue splats spray off
- [ ] Fairy Dust — pink glitter shimmer trail
- [ ] Oil Slick — rainbow sheen trail on the track surface (decal)
- [ ] Tire Marks — black skid mark decal left on track (static, not moving)
- [ ] Fireworks — trail ends in a tiny burst every 0.5 seconds
- [ ] Crystal — prismatic fragment trail, angular shards
- [ ] Neon Glow — bright solid colour trail with bloom effect
- [ ] Shadow Trail — dark trailing ghost copies of the marble fading out
- [ ] Angel Wings Dust — white particle trail curling outward like wings
- [ ] Radioactive — green glowing orbs float up off the trail
- [ ] Void Tendrils — dark finger-like trails reaching backward
- [ ] Music Notes — tiny 8th note sprites bounce off the trail
- [ ] Snow Trail — white flakes drift off; more intense at higher speeds
- [ ] Golden Road — gold glitter that settles on the track surface briefly
- [ ] Toxic Sludge — green slow-dripping trail
- [ ] Solar Flare — orange ribbon eruptions off the trail at intervals
- [ ] Gravity Ripple — circular ring emitted from marble every 0.3 seconds (like water drop rings)
- [ ] Binary Code — small 0/1 digits fly off the trail
- [ ] Blood Trail — red drops splatter (unlocked via horror-theme event)
- [ ] Ghost Echo — transparent ghost marble appears briefly behind actual marble
- [ ] Time Warp — trail curves backward on itself in a spiral
- [ ] Cosmic String — a thin glowing string connects marble to where it was 2 seconds ago

**25 More Accessories**
- [ ] Top Hat — tall cylindrical hat with brim; very prestigious
- [ ] Wizard Hat — tall conical hat with stars
- [ ] Pirate Hat — tri-cornered with skull-and-crossbones
- [ ] Cowboy Hat — wide brim western hat
- [ ] Santa Hat — red/white festive hat (holiday event)
- [ ] Witch Hat — black pointy hat (Halloween event)
- [ ] Viking Horns — two curved horns
- [ ] Cat Ears — two small triangular ears
- [ ] Rabbit Ears — long tall bunny ears
- [ ] Angel Halo (upgraded) — animated golden halo with light rays
- [ ] Devil Horns — small red horns
- [ ] Dragon Wings — large dragon wing pair (span 2× marble size)
- [ ] Jetpack — small rocket pack on the back; emits particle flame when accelerating
- [ ] Backpack — tiny explorer backpack
- [ ] Surfboard — marble rides a tiny surfboard; tilts with velocity direction
- [ ] Cape — flowing fabric cape that streams behind marble (cloth simulation or fake)
- [ ] Shield — small round shield on one side
- [ ] Sword — tiny sword on the side (crossed with shield = knight outfit)
- [ ] Spear — single long thin rod extending diagonally
- [ ] Fishing Rod — rod extends forward with a little hook
- [ ] Anchor — heavy anchor dragging behind marble (cosmetic; no physics weight)
- [ ] Umbrella — parasol spinning slowly above marble
- [ ] Balloon — small sphere on a string floating above marble
- [ ] Parachute — deployed above marble (cosmetic, doesn't slow marble)
- [ ] Satellite Dish — small dish rotating slowly on top

---

## Phase 27 — 100 More Options, Settings & Customisation

**Race Physics Settings (per session, streamer configures)**
- [ ] Gravity: 5 presets (Moon 0.3×, Low 0.6×, Normal 1.0×, Heavy 1.5×, Extreme 2.5×) + custom slider
- [ ] Marble friction: slider 0.0 (ice) → 1.0 (rubber)
- [ ] Marble restitution (bounciness): slider 0.0 → 2.0
- [ ] Marble mass: slider 0.5 → 5.0 (affects how obstacles affect them)
- [ ] Track friction global multiplier: 0.5–2.0
- [ ] Air resistance (linear damping): slider 0.0 → 0.3
- [ ] Spin resistance (angular damping): slider 0.0 → 0.5
- [ ] Max marble velocity cap: 10–200 units/s (prevents ultra-fast clips)
- [ ] Marble radius: 0.3–1.5 (changes physics sphere; cosmetic mesh scales with it)
- [ ] Sub-step count: 1–5 (more = more accurate physics, higher CPU cost; streamer chooses quality)
- [ ] Collision response multiplier: 0.5× gentle → 3× explosive
- [ ] Respawn height above checkpoint: 1–10 units
- [ ] Respawn velocity preserve: 0% (stop dead) → 100% (keep all momentum)

**Race Flow Settings**
- [ ] Countdown duration: 3 / 5 / 10 seconds
- [ ] Race start mode: simultaneous / rolling start / staggered 0.5s per marble
- [ ] Finish type: first-past-post / all-must-finish / top-N (race ends when Nth marble finishes)
- [ ] Race timeout: 1 / 2 / 3 / 5 / 10 / unlimited minutes
- [ ] Max respawns per marble: 0 (instant elimination) / 1 / 3 / 5 / unlimited
- [ ] Fall-off mode: Respawn / Elimination (already in Phase 22 — link here)
- [ ] Late join window: 0s / 5s / 10s / 30s / unlimited (time after race start to still join)
- [ ] Marble count cap: 16 / 32 / 50 / 100 / 200 / 500
- [ ] Coin multiplier: 1× / 2× / 3× / 5× / 10×
- [ ] Abilities allowed: All / Friendly only / Hostile only / None
- [ ] Ability cooldown multiplier: 0.5× (more frequent) → 5× (rare)
- [ ] Spectator mode: Open / Invite-only / Disabled
- [ ] Auto-announce winner in Twitch chat: On / Off
- [ ] Auto-create Twitch prediction on race start: On / Off
- [ ] Post results to Discord webhook: On / Off

**Visual & Rendering Settings (player-side)**
- [ ] Render resolution scale: 0.5× / 0.75× / 1.0× / 1.5× / 2.0× (supersampling)
- [ ] Shadow quality: Off / Low / Medium / High / Ultra
- [ ] Marble mesh quality: Low (8-seg) / Medium (16-seg) / High (32-seg) / Ultra (64-seg)
- [ ] Trail length: Off / Short (10 pts) / Medium (20 pts) / Long (40 pts)
- [ ] Particle density: 0% / 25% / 50% / 100% / 200% (extra sparkle)
- [ ] Nametag scale: 0.5× / 1.0× / 1.5× / 2.0×
- [ ] Nametag visibility distance: 5 / 15 / 30 / Unlimited units
- [ ] Post-processing: Off / Bloom only / Bloom + SSAO / Full (bloom + SSAO + chromatic aberration)
- [ ] Anti-aliasing: Off / MSAA×2 / MSAA×4 / MSAA×8 / TAA
- [ ] Field of view: 40°–100° slider
- [ ] Motion blur: Off / Low / High
- [ ] Depth of field: Off / Subtle / Strong (blurs near and far from focused marble)
- [ ] Camera shake: Off / Subtle / Normal / Extreme
- [ ] Screen space reflections: Off / On
- [ ] Skybox: Black / Gradient Dark / Space / Sunset / Storm / Custom colour

**HUD & UI Settings (player-side)**
- [ ] HUD visibility: Full / Minimal (timer only) / Hidden
- [ ] Leaderboard size: Top 3 / Top 5 / Top 10 / All
- [ ] Leaderboard position: Top-right / Top-left / Bottom-right / Bottom-left
- [ ] Leaderboard layout: Compact / Expanded (shows times)
- [ ] Race timer format: Stopwatch / Countdown (if timeout set)
- [ ] Minimap overlay: Off / Small / Large
- [ ] Marble speed indicator: Off / Bar / Number (units/s)
- [ ] Current place indicator: Off / On (shows your marble's current rank)
- [ ] Obstacle warning icons: Off / On (brief warning when obstacle activates near you)
- [ ] Ability status icons: Off / Minimal / Full (shows all active abilities on all marbles)
- [ ] Chat overlay (spectator): Off / Small / Full (scrolling Twitch chat panel)
- [ ] Announcement toasts: Off / Short / Long
- [ ] Photo finish indicator: Off / On
- [ ] Coin earned popups: Off / On
- [ ] Achievement notification: Off / On
- [ ] Record notification: Off / On

**Audio Settings**
- [ ] Master volume: 0–100%
- [ ] SFX volume: 0–100%
- [ ] Music volume: 0–100%
- [ ] Announcer voice: Off / Standard / Hype / Whisper / Robot
- [ ] Rolling sound: Off / On (pitch-shifted by speed)
- [ ] Collision sound: Off / Soft / Normal / Loud
- [ ] Countdown sound: Off / Beep / Air horn / Crowd
- [ ] Finish fanfare: Off / Classic / Epic / Quick
- [ ] Record jingle: Off / On
- [ ] Ability activation sound: Off / On
- [ ] Obstacle activation sound: Off / On
- [ ] Ambient track sound: Off / Crowd noise / Stadium / Nature / City
- [ ] Sound pack: Classic / 8-bit Retro / Satisfying ASMR / Anime SFX / Custom (upload ZIP)

**Accessibility Settings**
- [ ] Reduced motion: Off / On (disables particles, trails, camera shake, slow-mo)
- [ ] High contrast mode: Off / On (white nametags, bold outlines)
- [ ] Colourblind palette: None / Deuteranopia / Protanopia / Tritanopia / Monochrome
- [ ] Screen reader support: Off / On (announces finish positions, achievements via aria-live)
- [ ] Haptic feedback (mobile): Off / On
- [ ] Large text mode: Off / On (1.5× all HUD and UI text)
- [ ] Subtitle/caption overlay: Off / On (text version of audio announcements)
- [ ] Keyboard navigation: Off / On (tab-navigable results and menus)

**Twitch Integration Settings**
- [ ] Join command: custom text (default `!join`)
- [ ] Late join command: separate command (default `!latejoin`)
- [ ] Spectate command: `!watch` — sends viewer the spectator URL in chat
- [ ] Score command: `!score` → CubAssist posts caller's coins + points
- [ ] Leaderboard command: `!lb` → posts top 5 to chat
- [ ] Record command: `!record` → posts track record to chat
- [ ] Stats command: `!stats @username` → posts player stats to chat
- [ ] Shop command: `!shop` → posts shop URL to chat
- [ ] Ability command prefix: configurable (default `!ability`)
- [ ] Chat filter: block repeated !join spam from same user (rate limit per viewer)
- [ ] VIP bonus: VIP Twitch status grants +10% coins per race
- [ ] Sub bonus: subscribers earn +25% coins per race
- [ ] Mod bypass: mods can use streamer-only commands (!kick, !resetlobby)
- [ ] Bits support: viewer cheers X bits to activate an ability on a marble

---

## Phase 28 — Seasonal Events & Special Modes

- [ ] **Season system** — 3-month seasons with a season leaderboard, season-exclusive skins, and season champion badge
- [ ] **Holiday themes** — swap track colour palette and particles for Halloween / Christmas / etc. (date-driven)
- [ ] **Daily Challenge** — each day a specific community map is the "Daily Track"; race results on it count double; global daily leaderboard
- [ ] **Weekly Tournament** — auto-scheduled weekly tournament (Friday night); top-8 bracket, elimination rounds
- [ ] **Special event maps** — admin-published limited-time maps tied to events (e.g. "April Fools" map with chaos physics)
- [ ] **Chaos mode** — random events fire during the race: gravity flip (5 seconds), speed boost all marbles, random teleport, reverse gravity on all track pieces
- [ ] **King of the Hill** — single platform map; marbles must stay on top longest; physics pushes marbles off; last one standing wins
- [ ] **Coin collection mode** — coins scattered around the track; marbles collect coins on contact; most coins at finish wins (not speed)
- [ ] **Shrinking track** — track sections randomly disappear during the race; marbles that fall off are eliminated
- [ ] **Marble Battle Royale** — 100-player lobby, track has random hazards, marbles eliminated over time, last marble alive wins

---

## Phase 29 — Analytics & Streamer Insights

- [ ] **Per-session analytics** — after each race: average finish time, DNF rate, obstacle impact rate, most-used pieces
- [ ] **Heatmap** — visualise where marbles most commonly fall off or slow down on a given map (density overlay on 2D map view)
- [ ] **Viewer engagement score** — composite metric: unique players / total viewers × race duration × chat activity; shown on streamer dashboard
- [ ] **Best race moments** — auto-surfaced highlights from all-time history on a given channel
- [ ] **Growth charts** — players per session over time, repeat player rate, new vs returning players per stream
- [ ] **Map performance stats** — for each map: average race time, most common winner marble colour, most triggered obstacle
- [ ] **Export data** — CSV/JSON export of all race history for a channel (GDPR-compliant; streamer only)
- [ ] **Streamer report card** — weekly email/Discord DM summarising: races run, unique players, top marble this week, new records set

---

## Phase 30 — Infrastructure & Performance

- [ ] **Server-side physics validation** — optional mode: run cannon-es in Node.js worker on server, clients receive positions; prevents cheating in competitive mode
- [ ] **Redis session store** — replace in-memory `_sessions` dict in `marbles_irc.py` with Redis so multiple Flask workers share state
- [ ] **WebSocket support** — upgrade polling to WebSocket for play page real-time updates (player joins, race start signal); Flask-SocketIO
- [ ] **Map CDN** — store map JSON and thumbnails in object storage (S3-compatible) instead of local filesystem
- [ ] **Rate limiting on marble API** — extend existing rate limiter to all `/marbles/api/` routes
- [ ] **Marble physics worker** — offload cannon-es step to a Web Worker thread on client so physics doesn't block render
- [ ] **LOD system** — reduce marble mesh poly count when 50+ marbles are in scene (swap `SphereGeometry(0.5, 12, 12)` to `(0.5, 6, 6)`)
- [ ] **Marble pooling** — pre-allocate a pool of 200 marble bodies/meshes; reuse across races to avoid GC spikes
- [ ] **Streaming map load** — load map pieces progressively (visible first, off-screen after) to reduce initial load time on large maps
- [ ] **Automated map testing** — CI job that loads each published map and runs 10 marbles through it headlessly; flags maps where 0% finish

---

## Notes

### Currency system
- **Points** = competitive leaderboard rank. Earned from race finishes + bonuses. Cannot be spent. Resets per season. Determines your global rank.
- **Coins** = spendable in-game currency. Earned from racing. Spent on: abilities during races (via Twitch chat), cosmetics in the shop, upgrades. Does NOT affect leaderboard rank.
- `!score` chat command shows both: `@user — 1,240 pts (#12 global) | 350 coins`

### Technical
- All marbles static assets live in `website/marbles/` served at `/marbles/static/<path>`
- Dev server bypass: run `python dev_server.py` — auto-injects `cub_user` with owner Discord ID (no OAuth needed)
- IRC connection is anonymous (`justinfan`), no OAuth, works for any public Twitch channel
- Physics engine: **cannon-es** (pure ES module, no WASM, CDN-hosted)
- Map transfer editor → play page: `sessionStorage` (map JSON too large for URL params)
- Play page opens in same tab; "Back to Editor" button returns cleanly
- OBS browser source: use `?obs=1` param for chrome-free transparent mode, `/marbles/obs/<session_id>` for bookmarkable source

---

## Phase 33 — Marble Character-Select System

> Pre-race overlay where viewers choose which marble skin/character to play as.
> Viewers type `!play` (random marble) or `!play 2` (marble in slot 2) in Twitch chat.
> Joins the lobby AND picks a marble in one command.

- [x] `MarbleSession` — add `marble_types`, `player_selections`, `selection_open` fields
- [x] `MarbleSession.pick_marble()` — validate slot, restriction, assign username → slot
- [x] IRC tag parsing — `_parse_tags()`, `_viewer_roles()` helpers extract subscriber/vip/mod/broadcaster roles from Twitch tags
- [x] `_check_restriction()` — verify viewer meets marble restriction requirement
- [x] `_handle_line()` — route `!play`/`!play N` during `selection_open`; `!play` also adds user to player list (join + pick in one command)
- [x] `create_session()` — accepts optional `marble_types` list
- [x] `POST /marbles/api/game/<id>/selection` — open/close character select phase
- [x] `POST /marbles/api/game/<id>/roster` — live-update marble roster
- [x] `play.html` — `#overlayCharSelect` with marble grid + player tag list
- [x] `play.css` — `.charselect-panel`, `.csp-*` styles
- [x] `play.js` — `MARBLE_TYPES`, `MARBLE_SELECTIONS` globals; `showCharacterSelect()`, `renderCharSelectGrid()`, `renderCharSelectPlayers()`, `waitForCharacterSelect()`, `resolveMarbleType()`
- [x] `play.js` — `spawnMarbles()` uses marble type color if player picked one
- [x] `editor.html` — roster config section with slot rows (color/icon/name/restriction/toggle)
- [x] `editor.html` — "Open Character Select" / "Close Character Select" buttons in lobbyActive
- [x] `editor.js` — `_rosterInit()`, `_rosterBuildRow()`, `_rosterToPayload()`
- [x] `editor.js` — `_lobbyCreate()` includes `marble_types` roster in create payload
- [x] `editor.js` — `_lobbyUpdateUI()` shows marble badge (`icon + name`) next to player name
- [x] `editor.js` — `_openCharSelect()`, `_closeCharSelect()` handlers
- [x] `editor.css` — `.roster-slot-row`, `.roster-color`, `.roster-toggle`, `.roster-remove` styles
- [x] `editor.css` — `.lobby-marble-badge` pill style
- [x] Default 4-marble roster: Inferno 🔥, Glacier ❄️, Thunder ⚡, Phantom 👻
- [ ] Streamer can add/remove roster slots (up to configurable max, e.g. 8)
- [ ] "Randomise all" button that gives every player who typed `!play` a random enabled slot
- [ ] Show marble selection counts live in editor lobby (how many picked each slot)
- [ ] Play page: show each marble's type icon/name on the nametag (below username)
- [ ] Respect restriction during lobby join too (if viewer joins with `!join` but their only available marble requires sub, show a warning or assign default)

---

## Phase 34 — User Title / Prefix System

> Site-wide title prefixes shown before usernames. `[DEV]`, `[STAFF]`, `[STREAMER]`, `[DEFAULT]`.
> Titles show in marble player lists, leaderboards, scoreboards, and any place usernames appear.

- [x] `_ROLE_DISPLAY` dict — maps `dev/staff/streamer/default` → `[DEV]/[STAFF]/[STREAMER]/[DEFAULT]`
- [x] `_HARDCODED_ROLES` dict — permanent role assignments by Discord user ID (HexEchoTV = dev)
- [x] `_title_db` — file-backed dict at `data/user_titles.json` (`user_id → {role}`)
- [x] `_titles_load()` / `_titles_save()` — load on startup, save on role change
- [x] `get_user_title_prefix(user_id)` — returns `[ROLE]` string
- [x] `get_user_display_name(user_id, username)` — returns `[ROLE] username`
- [x] `GET /api/user/title` — return logged-in user's role + display prefix
- [x] `GET /api/user/<user_id>/title` — public title lookup by ID
- [x] `POST /api/admin/user/role` — dev/staff only: assign role to any user
- [ ] Inject `display_prefix` into `cub_user` session on login so templates can use it
- [ ] Show title prefix in site nav user widget (e.g. "[DEV] HexEchoTV" in top-right)
- [ ] Show title prefix in marble race HUD nametags above marbles
- [ ] Show title prefix in race results overlay
- [ ] Show title prefix in leaderboard entries
- [ ] Admin UI page (`/admin/titles`) — table of all assigned roles, search by username, assign/revoke with dropdown
- [ ] Title badge colours — [DEV] gold, [STAFF] blue, [STREAMER] purple, [DEFAULT] grey
