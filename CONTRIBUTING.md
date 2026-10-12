# Contributing

Thanks for wanting to make Love Crush better! Bug fixes, new languages, levels mechanics, music,
art and docs are all welcome.

## Setup

```bash
npm install
npm run dev        # http://localhost:5173  (?dev unlocks all levels, ?dev&level=42 jumps to a level)
npm run check      # typecheck + all tests — run this before opening a PR
```

Node 20+ is recommended. There are no runtime dependencies; dev tooling is Vite, TypeScript and Vitest.

## Ground rules

- **Keep `src/core`, `src/levels`, `src/ai` and `src/voice/love.ts` free of DOM / Web APIs.** They run in
  Node for tests and calibration.
- **No hard-coded UI text.** Add strings to `src/i18n/th.ts` (it defines the `Locale` type) and every other
  locale — TypeScript fails the build if a translation is missing.
- **Personal content belongs in `src/config/personal.ts`**, never in code. Keep the shipped defaults generic.
- Match the existing style (Prettier config in `.prettierrc`: single quotes, 120 columns).
- Add or update tests for behaviour changes. The event-stream contract test (`tests/events.test.ts`) must keep
  passing: the renderer only replays engine events, so they must always reproduce the final board.

## Common tasks

### Add a language
1. Copy `src/i18n/en.ts` to `src/i18n/<code>.ts` and translate.
2. Register it in `LOCALES` (`src/i18n/index.ts`) and add the code to `LocaleId` (`src/config/types.ts`).
3. Set `meta.speech` to a BCP-47 tag supported by the Web Speech API (e.g. `ja-JP`).

### Change difficulty or level content
The generator (`src/levels/generator.ts`) is deterministic per level number. After changing anything that
affects gameplay (generator, engine rules, difficulty targets) re-run the bot:

```bash
npm run calibrate            # all 1000 levels, ~80 s on 8+ cores
npm run calibrate -- --from 1 --to 50 --runs 30   # quick partial run
```

and commit the updated `src/levels/calibration.json`. `tests/levels.test.ts` checks the results land in the
intended win-rate bands.

### Add a fruit, special or obstacle
Engine rules live in `src/core/game.ts`; sprites in `src/render/sprites.ts`; animations in
`src/render/board-view.ts`. New engine behaviour should emit events (`src/core/events.ts`) rather than having
the renderer read the board mid-turn.

### Add a music track
Write a `TrackDef` in `src/audio/music.ts`, add it to `DEFS` and `TRACKS`, and add its mood line to every
locale (`tracks.<id>`). `renderTrack()` renders it offline so you can check levels in the browser console.

## Pull requests

- One topic per PR, with a short description and screenshots/recordings for visual changes.
- CI runs typecheck, tests and a production build.
