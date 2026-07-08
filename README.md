# Kill the Crows — HTML edition

A browser game that is **mainly [Kill the Crows]** — a top-down western gunslinger
where **one bullet kills one crow**, and the revolver's reload window is the moment
that gets you killed — blended with two other genres:

- **Enter the Gungeon** — a dodge-roll with invincibility frames, telegraphed
  projectiles to weave through, an arsenal of guns with distinct *behaviors* and
  signature **quirks** (one-shot kills, so guns differ by handling and trick
  rounds, not damage), and a **roguelike trinket** layer whose effects stack —
  and now form **set bonuses** and fire on how you *play* — into wild synergies.
- **An extraction shooter with a home base** — you don't play for score, you play
  for *loot and materials*. Deploy from your walkable **base** into a large,
  procedurally-generated frontier split into biome **zones** (deeper = deadlier &
  richer) dotted with named **landmarks**, explosive barrels, and locked
  **vaults**. Rummage containers, gather materials, crack glowing caches for
  trinkets, then reach **any** stagecoach and hold it to **extract**. Get gunned
  down first and the dirt keeps everything you were carrying — and lingering with
  a fat haul draws a rival **bounty hunter**. Back home, craft at the workbench
  and buy at the gunsmith to come back harder.

Every deploy also rolls a **zone event** (sandstorm, dead of night, gold rush,
blood moon…) that reshapes the run, and the frontier has **weather, dynamic
lighting, and reactive synthesized music** that swells with the danger.

It's built with plain HTML5 canvas and vanilla JavaScript — **no build step, no
libraries, and no image/audio assets**. Every sprite is drawn from code and every
sound is synthesized with WebAudio, so the whole thing runs offline.

## Play it

Just open **`index.html`** in any modern browser (double-click it — it runs from
`file://`). Or serve the folder if you prefer:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Your stash, upgrades, and owned weapons are saved in the browser (localStorage).

## Controls

| Action | Key |
| --- | --- |
| Move | **W A S D** / arrow keys |
| Aim | **Mouse** |
| Shoot | **Left click** (hold for automatic guns) |
| Reload | **R** (also auto-reloads when empty) |
| Dodge roll | **Space** (i-frames + short cooldown) |
| Loot | **hold E** next to a crate / barrel / wagon / well / cache |
| Active item | **F** (medkit / dynamite / molotov / barricade / trap) |
| Showdown | **Q** or **right-click** when the meter is full |
| Satchel | **hold Tab** to see what you're carrying |
| Pause | **Esc** |

Keys are rebindable in **Settings** (movement stays WASD/arrows), and there's
basic **gamepad** support (left stick move, right stick aim, RT shoot).

## Read the tells

Every crow dies to a single bullet — but so can you, if you ignore the wind-ups:

- **Rusher** — sprints at you and raises the knife for a beat (watch for the
  flash) before the strike.
- **Gunman** — stops dead and charges for **~3 seconds**: his aim line glows
  brighter until he fires a single slow bullet. Stillness is his weakness.
- **Sniper** — lurks behind a thin red laser, charging for **~5 seconds**; for the
  final beat the laser **locks and blinks** — step out of the line before the shot.
- **Brute** — leans back, kicks up dust, then shoulder-charges in a straight line
  for two hearts. Sidestep and he'll eat a wall.
- **Shielder** — carries a plank shield that blocks bullets from the front. It
  turns to face you only slowly, so **strafe or dodge around and shoot the flank**.
- **Bomber** — sprints in and detonates on contact; it also **explodes when shot**,
  so don't kill it in your own lap.
- **Coyote** — a fast beast that hunts in **packs of three**.
- **The Undertaker** (boss) — stalks the Badlands with real HP (and a health bar),
  summoning crows and sweeping buckshot. Downing it drops a **guaranteed rare**.
- **The Bounty Hunter** — a rival gunslinger with real HP who keeps his distance,
  strafes, dodge-rolls, and fires **telegraphed** aimed shots. He rides in once
  the bounty on your head climbs (carry loot, linger, or trigger a Gold Rush) and
  drops **premium spoils** — a rare trinket, a purse, and a **vault key**.

Crows can be set on **fire** (which spreads crow-to-crow), **stunned** (a dodge
with Smoke Bomb, or a Tesla arc), or **marked** for a richer, amplified kill.

## Active items, crafting & customization

- **Active items** (bought at the gunsmith, one equipped, charges refill each raid,
  used with **F**): Medkit, Dynamite, Molotov (burning ground), Barricade (temporary
  cover), Bear Trap.
- **Weapon attachments** — craft with materials at the gunsmith: Scope, Extended
  Mag, Hollow Points, Ricochet Kit, Incendiary Rounds. They stack with trinket
  effects.
- **Relic Table** (workbench) — gamble surplus materials for a random new trinket.
- **Difficulty** (Rookie / Outlaw / Legend), volume, **music** toggle, screen-shake,
  colorblind palette, and key rebinding live in **Settings**.

## Daily runs & records

- **Daily Run** (from the Map Table) seeds the whole world from today's date — the
  same map for everyone — and tracks your best haul.
- **Records** (title screen) is a bestiary of crows you've discovered, an
  achievement list, and unlockable **hats** you earn (e.g. beat the Undertaker for
  a top hat) and equip.

## Looting

Containers aren't shot open — you **rummage** them: stand close, hold **E**, and
stay exposed while the ring fills (crates are quick; the wagon and the old well
are slow but rich). You can't shoot mid-rummage, moving cancels, and getting hit
interrupts — looting is a risk you *choose*, like reloading.

- **Loose gold** (from kills and containers) is weightless and just counts up.
- **Valuables** (Pocket Watch, Gold Tooth, Deputy Badge…) each take one slot in
  your satchel — **6 slots** to start, more with the *Bigger Satchel* upgrade.
  When the bag is full, the leftovers stay glittering in the dirt: extract now,
  or push your luck.
- **Extract** to bank the gold *and* every item in the satchel. **Die** and the
  death screen itemizes exactly what you lost.

## Showdown

Kills feed a **Showdown** meter. When it's full, hit **Q** (or right-click) to
drop into a high-noon bullet-time: the Crows crawl, your cylinder never runs dry,
and you fan the hammer to clean house. Trinkets like *Deadeye Battery* (charges
faster) and *High Noon* (lasts longer) lean the whole build into it.

## Trinkets & builds (the roguelike layer)

Glowing **caches** in the raid cough up worn **trinkets** — passive charms that
stack and cross-pollinate, à la Balatro jokers. Weapon **racks** hand you
stranger irons: a **Bouncer** (ricochet), **Hex Pistol** (homing), **Arc Coil**
(chain lightning), **Buffalo Rifle** (pierces a whole line), **Boomstick**
(explosive slugs). Behaviors from guns and trinkets *add together*, so:

- **Powder Keg** (crows explode on death) + **Ricochet Rounds** / **Live Wire**
  (hits spread to more crows) → chain-reaction screen clears.
- **Twin Fang** doubles *every* on-kill effect — double explosions, double gold,
  double heals.
- **Gunslinger's Ledger** pays gold per trinket you carry, so a fat build pays
  itself off; stack **Prospector's Pact** and **Lucky Coin** for a gold engine.

**Set bonuses.** Every trinket carries a tag — *lead / arcane / grit / showdown /
gold* — and carrying enough of one lights a free bonus on top (3× gold → +35%
payout; 5× lead → an extra bullet; 3× arcane → an extra chain jump, and so on).
The HUD shows which sets are live.

**Event hooks.** Some trinkets react to *how you play*, not just what you shoot:
**Smoke Bomb** staggers crows when you dodge, **Fan Mail** sprays a ring of lead
when you finish a reload, **Grudge** turns your next shot after a hit into a
guaranteed explosive crit, and **Magpie** occasionally dupes a looted valuable.

**Guns have quirks, too.** The revolver's *last chamber* is always a crit; the
sawn-off and Boomstick **knock** shielders and bosses back; the rifle rewards a
half-second of stillness with a **marked, piercing called shot**; the repeater
**overheats** and jams if you never let off the trigger (watch the heat gauge);
the Arc Coil **stuns** what it can't kill.

**Insurance vs. risk:** the trinkets you equip in **camp** (up to your belt slots)
and your chosen iron are *insured* — kept even if you die. Trinkets and guns you
**find in a raid** are lost if you're killed, and only yours once you extract.
Buy trinkets and belt slots in the General Store, or gamble on finding them.

## Landmarks, barrels & vaults

The frontier is dotted with named **landmarks** — the Saloon, Silverpeak Mine,
Boot Hill, the Rusty Spur Ranch — each a denser cluster of loot around a walled
**interior room** you enter through a single doorway. Deep in the room sits a
locked **vault** stuffed with a guaranteed rare trinket, valuables, and
materials; it won't open without a **key** (found in a keychest nearby, or prised
off a downed bounty hunter).

The world is **reactive**, too: **powder barrels** detonate when shot or caught in
a blast and **chain** with each other, dynamite, and molotovs; **molotov and
incendiary fire spreads** across the ground and crow-to-crow; and **fences and
logs are destructible cover** that bullets and explosions tear apart.

## Zone events, weather & light

Every deploy rolls a seeded **zone event** that colours the whole run (the Daily
Run reproduces it for everyone):

- **Sandstorm** — a dust haze cuts your sight and drives the crows to knife range.
- **Dead of Night** — darkness; a **lighting** layer leaves you a lantern's worth
  of vision, punched wider by muzzle flashes, fires and explosions.
- **Gold Rush** — loot pays **double**, but threat and the bounty on you spike.
- **Dead Calm** — eerily few crows… for now.
- **Blood Moon** — the Undertaker wakes a tier early and the brutes roam.

Add **weather** (rain, drifting dust, sandstorms, the odd tumbleweed) and
**reactive music** — a synthesized bed whose percussion and lead fade in with the
threat, darken into a boss theme, and resolve with an extraction sting — and each
raid has its own atmosphere. Music has its own toggle in **Settings**.

## Your base & the frontier

You start at a **walkable home base** — a fenced camp with three benches you
approach and use with **E**:

- **Map Table** — pick your insured loadout (iron + trinkets) and **deploy**.
- **Workbench** — spend **materials** to upgrade the bench itself and, through it,
  your permanent gear (max health, cylinder capacity, reloads, dodge, speed,
  satchel size, trinket belt slots). A higher-level workbench unlocks higher tiers.
- **Gunsmith** — spend **gold** on new irons and trinkets.

Deploying drops you into a **large procedural world** of six biome zones — Ghost
Town, Dust Flats, Deadwood, the Badlands — arranged so difficulty, loot, materials,
and threat all grow the farther you push from the entry corner. A **minimap** shows
the zones (by difficulty), every extraction point, and the crows around you.

**Materials** (scrap / iron / relic) drop from containers and deeper crows and feed
the workbench. **Threat** climbs the longer you stay and the deeper you go: crows
spawn faster and nastier, so every extra crate is a gamble. Reach **any** of the
six stagecoaches and hold it to escape with your whole haul.

## The loop

```
BASE ──deploy──► FRONTIER ──► reach any stagecoach & hold ──► EXTRACTED (haul banked)
  ▲                 │
  │                 └──► gunned down ─────────────────────► DEAD (haul lost)
  │                                                             │
  └── craft with materials · buy with gold, then deploy again ◄─┘
```

Everything (world, loot, caches, extraction points) is re-seeded every run.

## Project layout

```
index.html            page + ordered <script> includes (classic scripts, window.KTC)
css/style.css         HUD + menu/shop styling
js/
  util.js             math, RNG, collision helpers
  input.js            keyboard + mouse
  sprites.js          palette + all procedural pixel art
  audio.js            WebAudio SFX + reactive layered music engine
  config.js           central tuning constants (KTC.Tune)
  weapons.js          data-driven gun table (handling + behaviors + quirks + attachments)
  trinkets.js         roguelike passives: mods + set bonuses + event hooks + synergies
  items.js            active items / consumables (F slot)
  events.js           per-run zone events / modifiers (weather, night, gold rush…)
  zones.js            biome definitions + organic world layout + materials
  meta.js             achievements, cosmetics, bestiary text, daily seed
  particles.js        particles, screen shake, floating text, lightning bolts
  projectile.js       tracer bullets + behaviors (pierce/bounce/explode/home/chain/burn/mark/knockback)
  loot.js             pickups, containers, barrels, caches, vaults, keys, hold-E channels
  enemy.js            crow AI + statuses + bounty-hunter rival + threat-driven wave director
  player.js           movement, dodge, shooting, reload, loot channel, mods
  level.js            procedural multi-zone world + landmarks/interiors + base hub + collision
  save.js             persistent stash / trinkets / materials / benches
  ui.js               DOM HUD, base + bench menus, minimap wiring, results
  game.js             states, camera, rendering, threat, extraction, events, lighting, weather
  main.js             bootstrap
```

[Kill the Crows]: https://store.steampowered.com/app/1972440/Kill_The_Crows/
