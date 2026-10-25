import type { BangumiSubject } from '@server/api/bangumi';
import BangumiAPI, { BANGUMI_ANIME_TYPE } from '@server/api/bangumi';
import type TheMovieDb from '@server/api/themoviedb';
import type {
  TmdbMovieResult,
  TmdbTvResult,
} from '@server/api/themoviedb/interfaces';
import cacheManager from '@server/lib/cache';
import logger from '@server/logger';

/** Shape sent to the frontend for every Bangumi card. */
export interface BangumiItem {
  id: number;
  name: string;
  nameCn: string;
  date?: string;
  weekday?: number;
  platform?: string;
  score?: number;
  rank?: number;
  ratingCount?: number;
  poster?: string;
  doing?: number;
}

export interface BangumiMatch {
  bangumiId: number;
  mediaType: 'movie' | 'tv' | null;
  tmdbId: number | null;
  title: string;
}

export interface BangumiRating {
  id: number;
  nameCn: string;
  score?: number;
  rank?: number;
  ratingCount?: number;
  url: string;
}

const https = (url?: string) => url?.replace(/^http:\/\//, 'https://');

export const toBangumiItem = (s: BangumiSubject): BangumiItem => ({
  id: s.id,
  name: s.name,
  nameCn: s.name_cn || s.name,
  date: s.date || s.air_date || undefined,
  weekday: s.air_weekday,
  platform: s.platform,
  score: s.rating?.score || undefined,
  rank: s.rating?.rank || s.rank || undefined,
  ratingCount: s.rating?.total || undefined,
  poster: https(s.images?.common || s.images?.large || s.images?.medium),
  doing: s.collection?.doing,
});

/** Japanese anime seasons start in January, April, July and October. */
export const currentSeason = (now = new Date()) => {
  const year = now.getFullYear();
  const startMonth = Math.floor(now.getMonth() / 3) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { year, month: startMonth + 1, start: iso(start), end: iso(end) };
};

// ---- Bangumi subject -> TMDB ----
// Bangumi has no TMDB ids. Each season is its own Bangumi subject, while TMDB keeps one
// show with several seasons, so season suffixes are stripped before searching TMDB.

const MOVIE_PLATFORMS = ['剧场版', '劇場版', 'Movie', '电影'];

const SEASON_SUFFIXES = [
  /\s*第?\s*[0-9０-９一二三四五六七八九十]+\s*(期|季|クール|部|シーズン)\s*$/,
  /\s*(\d+)(st|nd|rd|th)\s+season\s*$/i,
  /\s*season\s*\d+\s*$/i,
  /\s*(Ⅱ|Ⅲ|Ⅳ|Ⅴ|II|III|IV|V)\s*$/,
  /\s+\d{1,2}\s*$/,
  /\s*(前編|後編|前篇|后篇|第?\d+クール)\s*$/,
];

const stripSeason = (name: string): { base: string; isSequel: boolean } => {
  let base = name.trim();
  let isSequel = false;
  for (const re of SEASON_SUFFIXES) {
    const next = base.replace(re, '').trim();
    if (next && next !== base) {
      base = next;
      isSequel = true;
    }
  }
  return { base: base.replace(/^(劇場版|剧场版)\s*/, ''), isSequel };
};

const normalize = (s?: string) =>
  (s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s:：・·!！?？\-－~～'"「」『』()（）.,，、。]/g, '');

const yearOf = (date?: string) =>
  date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : undefined;

type Candidate = (TmdbTvResult | TmdbMovieResult) & {
  name?: string;
  title?: string;
};

const scoreCandidate = (
  c: Candidate,
  queries: string[],
  year: number | undefined,
  isSequel: boolean
) => {
  const orig = normalize(
    'original_name' in c ? c.original_name : c.original_title
  );
  const local = normalize(c.name ?? c.title);
  const qs = queries.map(normalize).filter(Boolean);
  let score = 0;
  if (qs.some((q) => q === orig || q === local)) {
    score += 4;
  } else if (
    qs.some(
      (q) =>
        q.length >= 2 &&
        (orig.includes(q) || q.includes(orig) || local.includes(q))
    )
  ) {
    score += 2;
  }
  if (c.genre_ids?.includes(16)) score += 2;
  if (['ja', 'zh', 'ko'].includes(c.original_language)) score += 1;
  const cYear = yearOf(
    'first_air_date' in c ? c.first_air_date : c.release_date
  );
  // A sequel season's subject date is later than the show's first air date
  if (year && cYear && !isSequel) {
    if (cYear === year) score += 2;
    else if (Math.abs(cYear - year) === 1) score += 1;
    // Same name, different decade: a remake or reboot (Tom and Jerry 1965 vs 2023)
    else if (Math.abs(cYear - year) > 2) score -= 3;
  } else if (year && cYear && isSequel) {
    score += cYear <= year ? 1 : -3;
  }
  return score + Math.min((c.popularity ?? 0) / 200, 0.5);
};

export const matchBangumiSubject = async (
  bangumiId: number,
  tmdb: TheMovieDb
): Promise<BangumiMatch> => {
  const cache = cacheManager.getCache('bangumi').data;
  const key = `match:${bangumiId}`;
  const cached = cache.get<BangumiMatch>(key);
  if (cached) return cached;

  const subject = await new BangumiAPI().getSubject(bangumiId);
  const mediaType: 'movie' | 'tv' = MOVIE_PLATFORMS.includes(
    subject.platform ?? ''
  )
    ? 'movie'
    : 'tv';
  const year = yearOf(subject.date);
  const fromName = stripSeason(subject.name);
  const fromCn = stripSeason(subject.name_cn ?? '');
  const isSequel = fromName.isSequel || fromCn.isSequel;
  const queries = [
    ...new Set(
      [subject.name, fromName.base, subject.name_cn, fromCn.base].filter(
        (q): q is string => !!q
      )
    ),
  ];

  const seen = new Map<number, Candidate>();
  for (const query of queries) {
    // Sequels were first aired earlier, so only filter by year for first seasons / movies
    const years = isSequel ? [undefined] : [year, undefined];
    for (const y of years) {
      const res =
        mediaType === 'movie'
          ? await tmdb.searchMovies({ query, year: y, page: 1 })
          : await tmdb.searchTvShows({ query, year: y, page: 1 });
      for (const r of res.results as Candidate[]) {
        if (!seen.has(r.id)) seen.set(r.id, r);
      }
      if (res.results.length) break;
    }
  }

  let best: { c: Candidate; score: number } | undefined;
  for (const c of seen.values()) {
    const score = scoreCandidate(c, queries, year, isSequel);
    if (!best || score > best.score) best = { c, score };
  }

  const match: BangumiMatch = {
    bangumiId,
    mediaType: best && best.score >= 4 ? mediaType : null,
    tmdbId: best && best.score >= 4 ? best.c.id : null,
    title: subject.name_cn || subject.name,
  };
  logger.debug('Matched Bangumi subject to TMDB', {
    label: 'Bangumi',
    bangumiId,
    title: match.title,
    tmdbId: match.tmdbId,
    score: best?.score,
  });
  // Misses are retried sooner: TMDB may add the title later
  cache.set(key, match, match.tmdbId ? 7 * 86400 : 86400);
  return match;
};

// ---- TMDB -> Bangumi rating (for detail pages) ----

export const lookupBangumiRating = async ({
  mediaType,
  tmdbId,
  tmdb,
}: {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  tmdb: TheMovieDb;
}): Promise<BangumiRating | null> => {
  const cache = cacheManager.getCache('bangumi').data;
  const key = `rating:${mediaType}:${tmdbId}`;
  const cached = cache.get<BangumiRating | false>(key);
  if (cached !== undefined) return cached || null;

  let keyword: string;
  let year: number | undefined;
  if (mediaType === 'tv') {
    const show = await tmdb.getTvShow({ tvId: tmdbId });
    keyword = show.original_name;
    year = yearOf(show.first_air_date);
  } else {
    const movie = await tmdb.getMovie({ movieId: tmdbId });
    keyword = movie.original_title;
    year = yearOf(movie.release_date);
  }

  const res = await new BangumiAPI().searchSubjects({
    keyword,
    sort: 'match',
    filter: { type: [BANGUMI_ANIME_TYPE] },
    limit: 10,
  });
  const wanted = normalize(keyword);
  const hit =
    res.data.find(
      (s) =>
        yearOf(s.date) === year &&
        (normalize(s.name) === wanted || normalize(s.name_cn) === wanted)
    ) ??
    res.data.find((s) => yearOf(s.date) === year) ??
    res.data.find((s) => normalize(s.name) === wanted);

  const rating: BangumiRating | null = hit
    ? {
        id: hit.id,
        nameCn: hit.name_cn || hit.name,
        score: hit.rating?.score || undefined,
        rank: hit.rating?.rank || undefined,
        ratingCount: hit.rating?.total || undefined,
        url: `https://bgm.tv/subject/${hit.id}`,
      }
    : null;
  cache.set(key, rating ?? false, 7 * 86400);
  return rating;
};
