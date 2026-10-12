/**
 * Board topologies. '#' = playable, '.' = void. Shapes are symmetric (mirror, or point for stairs) and at most
 * 8 columns wide, so cells stay finger-friendly (~44px+) on a 375px-wide phone.
 */
export interface Shape {
  name: string;
  rows: string[];
  /** First level where the shape may appear. */
  from: number;
  /** 0 = roomy & forgiving, 1 = cramped & tricky. */
  hardness: number;
  /** Two halves joined by portals (left bottoms feed right tops). */
  split?: boolean;
}

export const MAX_COLS = 8;

export const SHAPES: Shape[] = [
  { name: 'square8', from: 1, hardness: 0.1, rows: Array(8).fill('########') },
  { name: 'tall8', from: 1, hardness: 0.05, rows: Array(9).fill('########') },
  { name: 'tall7', from: 11, hardness: 0.35, rows: Array(9).fill('#######') },
  { name: 'wide', from: 11, hardness: 0.3, rows: Array(7).fill('########') },
  {
    name: 'circle',
    from: 11,
    hardness: 0.25,
    rows: ['..####..', '.######.', '########', '########', '########', '########', '.######.', '..####..'],
  },
  {
    name: 'heart',
    from: 14,
    hardness: 0.4,
    rows: ['.##..##.', '########', '########', '########', '########', '.######.', '..####..', '...##...'],
  },
  {
    name: 'cross',
    from: 25,
    hardness: 0.4,
    rows: ['..####..', '..####..', '########', '########', '########', '########', '..####..', '..####..'],
  },
  {
    name: 'diamond',
    from: 30,
    hardness: 0.6,
    rows: ['...##...', '..####..', '.######.', '########', '########', '########', '.######.', '..####..', '...##...'],
  },
  {
    name: 'hourglass',
    from: 35,
    hardness: 0.65,
    rows: ['########', '########', '.######.', '..####..', '..####..', '.######.', '########', '########'],
  },
  {
    name: 'arch',
    from: 45,
    hardness: 0.55,
    rows: ['########', '########', '########', '########', '###..###', '###..###', '###..###', '###..###', '###..###'],
  },
  {
    name: 'butterfly',
    from: 55,
    hardness: 0.6,
    rows: ['##....##', '###..###', '########', '########', '########', '########', '###..###', '##....##'],
  },
  {
    name: 'split',
    from: 61,
    hardness: 0.7,
    split: true,
    rows: Array(9).fill('###..###'),
  },
  {
    name: 'stairs',
    from: 65,
    hardness: 0.6,
    rows: ['####....', '#####...', '######..', '#######.', '########', '.#######', '..######', '...#####', '....####'],
  },
  {
    name: 'donut',
    from: 75,
    hardness: 0.55,
    rows: ['########', '########', '########', '###..###', '###..###', '########', '########', '########'],
  },
  {
    name: 'castle',
    from: 85,
    hardness: 0.45,
    rows: ['##.##.##', '########', '########', '########', '########', '########', '########', '########', '########'],
  },
];

export function shapeByName(name: string): Shape {
  const s = SHAPES.find((x) => x.name === name);
  if (!s) throw new Error(`unknown shape ${name}`);
  return s;
}
