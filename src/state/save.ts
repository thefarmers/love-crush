export const MAX_HEARTS = 5;
const KEY = 'love-crush-save-v1';

export type MusicChoice = 'kalimba' | 'harp' | 'lofi' | 'custom';

export interface Settings {
  sfx: boolean;
  music: boolean;
  vibrate: boolean;
  track: MusicChoice;
}

export interface SaveData {
  v: 1;
  /** Highest level that can be played. */
  unlocked: number;
  stars: Record<number, number>;
  best: Record<number, number>;
  hearts: number;
  boosters: { rainbow: number };
  /** Indices into PERSONAL.loveCards that have been revealed. */
  cards: number[];
  settings: Settings;
  stats: { loveSaid: number; wins: number; losses: number };
}

type KV = Pick<Storage, 'getItem' | 'setItem'>;

export function freshSave(): SaveData {
  return {
    v: 1,
    unlocked: 1,
    stars: {},
    best: {},
    hearts: MAX_HEARTS,
    boosters: { rainbow: 0 },
    cards: [],
    settings: { sfx: true, music: true, vibrate: true, track: 'kalimba' },
    stats: { loveSaid: 0, wins: 0, losses: 0 },
  };
}

/** Progress persistence. Storage failures (private mode etc.) never break the game. */
export class SaveStore {
  data: SaveData;
  private storage: KV | null;

  constructor(storage: KV | null) {
    this.storage = storage;
    this.data = this.load();
  }

  private load(): SaveData {
    try {
      const raw = this.storage?.getItem(KEY);
      if (!raw) return freshSave();
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      const base = freshSave();
      return {
        ...base,
        ...parsed,
        boosters: { ...base.boosters, ...parsed.boosters },
        settings: { ...base.settings, ...parsed.settings },
        stats: { ...base.stats, ...parsed.stats },
        hearts: Math.max(0, Math.min(MAX_HEARTS, parsed.hearts ?? MAX_HEARTS)),
        v: 1,
      };
    } catch {
      return freshSave();
    }
  }

  save(): void {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage full or blocked: keep playing in memory */
    }
  }

  get hearts(): number {
    return this.data.hearts;
  }

  loseHeart(): number {
    this.data.hearts = Math.max(0, this.data.hearts - 1);
    this.data.stats.losses++;
    this.save();
    return this.data.hearts;
  }

  refillHearts(): void {
    this.data.hearts = MAX_HEARTS;
    this.data.stats.loveSaid++;
    this.save();
  }

  /** Records a win; returns true when this unlocked a new level. */
  completeLevel(level: number, stars: number, score: number): boolean {
    const d = this.data;
    d.stars[level] = Math.max(d.stars[level] ?? 0, stars);
    d.best[level] = Math.max(d.best[level] ?? 0, score);
    d.stats.wins++;
    const unlockedNew = level + 1 > d.unlocked;
    d.unlocked = Math.max(d.unlocked, level + 1);
    this.save();
    return unlockedNew;
  }

  totalStars(): number {
    return Object.values(this.data.stars).reduce((a, b) => a + b, 0);
  }

  addBooster(kind: 'rainbow', n = 1): void {
    this.data.boosters[kind] += n;
    this.save();
  }

  useBooster(kind: 'rainbow'): boolean {
    if (this.data.boosters[kind] <= 0) return false;
    this.data.boosters[kind]--;
    this.save();
    return true;
  }

  /** Picks a love card, preferring ones not seen yet. */
  drawCard(total: number, rand: () => number = Math.random): number {
    const seen = new Set(this.data.cards);
    const unseen = Array.from({ length: total }, (_, i) => i).filter((i) => !seen.has(i));
    const pool = unseen.length ? unseen : Array.from({ length: total }, (_, i) => i);
    const pick = pool[Math.floor(rand() * pool.length)];
    if (!seen.has(pick)) this.data.cards.push(pick);
    this.save();
    return pick;
  }

  setSetting<K extends keyof Settings>(k: K, v: Settings[K]): void {
    this.data.settings[k] = v;
    this.save();
  }

  reset(): void {
    const settings = this.data.settings;
    this.data = { ...freshSave(), settings };
    this.save();
  }
}
