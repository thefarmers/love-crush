# Love Crush

**A match-3 game you can turn into a gift for someone you love.** Fork it, put your names,
messages and photos in one config file, deploy it for free — and when they run out of hearts,
they refill them by saying *"I love you"* out loud.

[ภาษาไทย / Thai README](README.th.md)

- 🍓 1,000 procedurally generated levels, difficulty calibrated by an AI bot
- 🎨 Everything drawn in code (no image assets): six fruits, specials, effects, a blush & ivory theme
- 🎵 Three soundtracks composed and synthesized in code (kalimba, harp waltz, lo-fi piano) — or use your own song
- 💌 Voice-powered "say I love you" mechanic (Web Speech API + loudness meter), love-letter cards and real-life coupons
- 📱 Mobile-first PWA, works offline, no backend, no tracking
- ✅ 100+ tests, TypeScript, zero runtime dependencies

## Make it yours in 5 minutes

1. **Fork** this repo and clone it.
2. Edit **`src/config/personal.ts`** — the only file you need to touch:

   | Field | What it does |
   | --- | --- |
   | `locale` | UI language: `'th'` or `'en'` (add more in `src/i18n/`) |
   | `partnerName`, `myName` | How the game addresses the player and you |
   | `loveKeywords` | Words that count as "I love you" (in your language) |
   | `loveCards` | Cards revealed after each "I love you" — notes, coupons, photos |
   | `secretPhrases` | Say one for a free booster |
   | `winMessages`, `loseMessages` | Lines on the result screens |
   | `specialLevels` | Notes on meaningful levels (anniversary dates, …) |
   | `bgm` | Your own song, e.g. `'music/our-song.mp3'` |

   Starting in English? Copy [`examples/personal.en.ts`](examples/personal.en.ts) over it.
3. Drop photos into `public/photos/` and songs into `public/music/`.
4. Run it:

   ```bash
   npm install
   npm run dev
   ```

5. Run `npm test` — it also validates your config.

> **Privacy:** forks of a public repo are public, and so is a GitHub Pages site. Anything you put in
> `personal.ts`, `public/photos/` or `public/music/` will be visible to anyone with the link. Use
> *Use this template* → a private repo if you want the source private, and only add photos you are happy
> to publish (or host them somewhere private and keep the site link to yourselves).

## Deploy (free, with https — needed for the microphone)

**GitHub Pages:** push to `main`, then in your repo go to *Settings → Pages → Source: GitHub Actions*.
The included workflow tests, builds and publishes the game to `https://<you>.github.io/<repo>/`.

**Anything else:** `npm run build` and upload `dist/` to any static host (Netlify Drop, Vercel, Cloudflare Pages…).

On a phone, *Share → Add to Home Screen* gives a full-screen app that plays offline and keeps progress safer.

## How it plays

- Match 3 · line of 4 → **streak fruit** (clears a row/column) · L/T → **gold-ring fruit** (3×3 blast)
  · line of 5 → **rainbow pearl** (clears one fruit everywhere) · 2×2 → **winged cupid** (flies to your goals)
- Swap two specials for combos (cross, 3×3 cross, 5×5 blast, pearl storms, board clear…)
- Goals rotate every few levels: jelly, collect, drop the ring/letter, gift boxes, chocolate, score, timed boss
- Twists: multi-layer boxes, ribbon locks, spreading chocolate, upward/sideways gravity, warp-gate split boards, 15 board shapes
- Difficulty is a sawtooth inside every block of ten levels, on top of a gentle ramp over ~250 levels:
  early levels are generous (most wins earn 3 stars), later ones become a real chase.

## Under the hood

| Folder | |
| --- | --- |
| `src/core` | Pure game engine (no DOM): board, matches, specials, gravity, turns → event stream |
| `src/levels` | Level generator, shapes, difficulty curve, `calibration.json` |
| `src/ai` | Greedy look-ahead bot + calibrator |
| `src/render` | Canvas renderer: procedural sprites, animations, particles, themes |
| `src/audio` | Web Audio SFX and the music sequencer / instruments |
| `src/voice` | Love detection (pure logic) + microphone / Speech API |
| `src/ui` | Screens: title, map, game, love modal, cards |
| `src/i18n` | All UI text (`th`, `en`) |
| `src/config` | `personal.ts` ← edit me |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit, and
[CONTRIBUTING.md](CONTRIBUTING.md) for the workflow.

### Useful commands

```bash
npm run dev         # dev server
npm test            # all tests (engine, levels, bot, voice, config, locales)
npm run typecheck   # TypeScript
npm run build       # production build in dist/
npm run calibrate   # re-run the bot over all 1000 levels (~80 s on 8+ cores)
```

Dev shortcuts: `?dev` unlocks every level, `?dev&level=95` opens level 95, and `window.__lc` exposes the app in dev builds.

## Browser support notes

- Speech recognition: best in Chrome (desktop/Android). Safari on iOS needs Siri/Dictation enabled.
  Firefox has no Speech API — the game falls back to a loudness check. Every browser can also *type* it.
- The microphone only works on `https://` or `localhost`.
- Vibration is not available to web pages on iOS.
- Progress lives in the browser's localStorage.

## License

[MIT](LICENSE) — make something lovely.
