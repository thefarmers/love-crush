/**
 * Link-preview metadata (Open Graph / Twitter cards) injected into index.html at build time.
 * Pure: the build passes in the config and process.env so this can be unit-tested.
 */
import type { PersonalConfig } from '../src/config/types';

type Env = Record<string, string | undefined>;

const withSlash = (u: string) => (u.endsWith('/') ? u : `${u}/`);

/**
 * Public URL of the deployed site. Social scrapers need absolute URLs for previews.
 * SITE_URL wins; otherwise inferred from GitHub Actions, Netlify or Vercel.
 */
export function siteUrl(env: Env): string | null {
  if (env.SITE_URL) return withSlash(env.SITE_URL);
  const repo = env.GITHUB_REPOSITORY;
  if (repo && env.GITHUB_ACTIONS) {
    const [owner, name] = repo.split('/');
    const host = `${owner.toLowerCase()}.github.io`;
    return name.toLowerCase() === host ? `https://${host}/` : `https://${host}/${name}/`;
  }
  if (env.NETLIFY && env.URL) return withSlash(env.URL);
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}/`;
  return null;
}

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function shareMeta(config: PersonalConfig, env: Env): string {
  const { title, description, imageAlt } = config.share;
  const url = siteUrl(env);
  const image = `${url ?? ''}og-image.png`;
  const ogLocale = config.locale === 'th' ? 'th_TH' : 'en_US';
  const tags: [string, string, string][] = [
    ['name', 'description', description],
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', 'Love Crush'],
    ['property', 'og:title', title],
    ['property', 'og:description', description],
    ['property', 'og:image', image],
    ['property', 'og:image:width', '1200'],
    ['property', 'og:image:height', '630'],
    ['property', 'og:image:alt', imageAlt],
    ['property', 'og:locale', ogLocale],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', title],
    ['name', 'twitter:description', description],
    ['name', 'twitter:image', image],
  ];
  if (url) tags.push(['property', 'og:url', url]);
  const lines = tags.map(([k, n, v]) => `<meta ${k}="${n}" content="${attr(v)}" />`);
  if (url) lines.push(`<link rel="canonical" href="${attr(url)}" />`);
  return lines.join('\n    ');
}
