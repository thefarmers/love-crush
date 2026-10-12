# Architecture

```
            ┌───────────── src/config/personal.ts (names, cards, locale, …)
            │
 src/ui ────┼── App (screens, flows) ──► GameScreen ──► BoardView (canvas)
            │        │                       │              ▲
            │        │                       ▼              │ phases (events)
            │        │                 core/Game ───────────┘
            │        │                       ▲
            │        └── levels/getLevel ────┘  (generator + calibration.json)
            │
            ├── audio/Sfx ──► music/Sequencer + Instruments (Web Audio)
            └── voice/LoveListener ──► voice/love (pure judging)
```

## Engine (`src/core`)
- `Board` holds cells (`playable`, `tile`, `jelly`, `lock`, `blocker`) and a precomputed **flow graph**
  (`down`/`feeder` per cell) built from the gravity direction and portals. Void gaps are tunnelled through.
- `findMatches` finds runs of 3+ and 2×2 squares, groups them, and classifies the special they create
  (5-line → rainbow pearl, L/T → bomb, 4-line → line, square → cupid).
- `Game.trySwap(a, b)` resolves a whole turn synchronously — matches, special activations (a time-ordered
  queue), blockers, gravity ticks with diagonal sliding, item collection, cascades, chocolate spread, shuffle —
  and returns a list of **phases** (`events.ts`). With `record: false` (used by the bot) no events are built.
- Determinism: all randomness goes through the seeded `Rng`.

## Rendering (`src/render`)
- `sprites.ts` paints every sprite once per size into offscreen canvases (fruits are Path2D silhouettes +
  gradients).
- `BoardView.play(phases)` replays events with tweens; it never reads the board mid-turn, and `sync()` snaps
  visuals to the engine after each turn. Times inside a clear phase are abstract beats (`BEAT` ms each).

## Levels & AI (`src/levels`, `src/ai`)
- `generateLevel(n, salt)` builds level `n` deterministically: tier from the sawtooth (`difficulty.ts`),
  objective rotation, shape (`shapes.ts`, ≤ 8 columns), obstacles and twists unlocked over time.
- `solver.ts` is a greedy look-ahead bot: it simulates every legal swap on a clone with an *independent* RNG
  (so it can't peek at refills) and scores goal progress + specials.
- `calibrate.ts` plays each level many times with a large move budget; the moves needed at the target
  win-rate quantile become the level's move count, then a verification batch nudges it into the band and
  derives star thresholds. `scripts/calibrate.mjs` runs this across worker threads.

## Voice (`src/voice`)
- `love.ts` (pure): normalisation, keyword / fuzzy secret-phrase matching, and `judgeAttempt` which
  combines transcript and loudness ("too quiet", "no love heard", …).
- `listener.ts`: Web Speech API + an `AnalyserNode` meter; either may be unavailable.

## Audio (`src/audio`)
- `sfx.ts`: the `Sfx` facade (sound effects, music on/off, track choice, custom song file).
- `music.ts`: `Instruments` (kalimba, Karplus–Strong harp, FM electric piano, flute, strings, drums) and
  `TrackDef`s played by a look-ahead `Sequencer`.

## Persistence (`src/state/save.ts`)
LocalStorage-backed `SaveStore` (progress, stars, hearts, boosters, collected cards, settings). Storage
failures never break the game.
