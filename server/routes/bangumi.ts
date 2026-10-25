import BangumiAPI, { BANGUMI_ANIME_TYPE } from '@server/api/bangumi';
import TheMovieDb from '@server/api/themoviedb';
import {
  currentSeason,
  lookupBangumiRating,
  matchBangumiSubject,
  toBangumiItem,
} from '@server/lib/bangumi';
import logger from '@server/logger';
import { Router } from 'express';

const bangumiRoutes = Router();
const PAGE_SIZE = 30;

const pageParams = (page: unknown) => {
  const p = Math.max(1, Number(page) || 1);
  return { limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE, page: p };
};

// Bangumi and TMDB both go through the proxy, which drops the odd TLS handshake: retry once
const withRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return fn();
  }
};

const fail = (next: (err: unknown) => void, message: string, e: Error) => {
  logger.warn(message, { label: 'Bangumi', errorMessage: e.message });
  next({ status: 502, message });
};

/** 每日放送：当季在播，按星期分组 */
bangumiRoutes.get('/calendar', async (_req, res, next) => {
  try {
    const days = await withRetry(() => new BangumiAPI().getCalendar());
    return res.status(200).json(
      days.map((day) => ({
        weekday: { id: day.weekday.id, cn: day.weekday.cn },
        items: day.items
          .filter((s) => (s.type ?? BANGUMI_ANIME_TYPE) === BANGUMI_ANIME_TYPE)
          .map(toBangumiItem)
          .sort((a, b) => (b.doing ?? 0) - (a.doing ?? 0)),
      }))
    );
  } catch (e) {
    return fail(next, 'Unable to load Bangumi calendar.', e);
  }
});

/** 本季新番：本季开播的动画，按热度排序 */
bangumiRoutes.get('/season', async (req, res, next) => {
  const { limit, offset, page } = pageParams(req.query.page);
  const season = currentSeason();
  try {
    const data = await withRetry(() =>
      new BangumiAPI().searchSubjects({
        sort: 'heat',
        filter: {
          type: [BANGUMI_ANIME_TYPE],
          air_date: [`>=${season.start}`, `<${season.end}`],
        },
        limit,
        offset,
      })
    );
    return res.status(200).json({
      page,
      totalResults: data.total,
      totalPages: Math.ceil(data.total / PAGE_SIZE),
      season: { year: season.year, month: season.month },
      results: data.data.map(toBangumiItem),
    });
  } catch (e) {
    return fail(next, 'Unable to load this season from Bangumi.', e);
  }
});

/** 排行：Bangumi 动画总排名 */
bangumiRoutes.get('/ranking', async (req, res, next) => {
  const { limit, offset, page } = pageParams(req.query.page);
  try {
    const data = await withRetry(() =>
      new BangumiAPI().searchSubjects({
        sort: 'rank',
        filter: { type: [BANGUMI_ANIME_TYPE], rank: ['>0'] },
        limit,
        offset,
      })
    );
    return res.status(200).json({
      page,
      totalResults: data.total,
      totalPages: Math.ceil(data.total / PAGE_SIZE),
      results: data.data.map(toBangumiItem),
    });
  } catch (e) {
    return fail(next, 'Unable to load the Bangumi ranking.', e);
  }
});

/** Bangumi 条目 → TMDB 条目，用于跳到 Seerr 自己的详情页去请求 */
bangumiRoutes.get<{ subjectId: string }>(
  '/subject/:subjectId/match',
  async (req, res, next) => {
    const subjectId = Number(req.params.subjectId);
    try {
      const match = await withRetry(() =>
        matchBangumiSubject(subjectId, new TheMovieDb())
      );
      return res.status(200).json(match);
    } catch (e) {
      return fail(next, 'Unable to match this Bangumi subject to TMDB.', e);
    }
  }
);

/** TMDB 条目 → Bangumi 评分，用于详情页 */
bangumiRoutes.get('/rating', async (req, res, next) => {
  const mediaType = req.query.mediaType === 'movie' ? 'movie' : 'tv';
  const tmdbId = Number(req.query.tmdbId);
  if (!tmdbId) {
    return next({ status: 400, message: 'tmdbId is required.' });
  }
  try {
    const rating = await withRetry(() =>
      lookupBangumiRating({ mediaType, tmdbId, tmdb: new TheMovieDb() })
    );
    if (!rating) {
      return next({ status: 404, message: 'Not found on Bangumi.' });
    }
    return res.status(200).json(rating);
  } catch (e) {
    return fail(next, 'Unable to look up the Bangumi rating.', e);
  }
});

export default bangumiRoutes;
