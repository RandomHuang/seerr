import cacheManager from '@server/lib/cache';
import ExternalAPI from './externalapi';

/**
 * Bangumi (bgm.tv) public API client.
 * Docs: https://bangumi.github.io/api/ — no token is needed for public data,
 * but Bangumi asks every client to send an identifying User-Agent.
 */

export const BANGUMI_ANIME_TYPE = 2;

export interface BangumiImages {
  large?: string;
  common?: string;
  medium?: string;
  small?: string;
  grid?: string;
}

export interface BangumiSubject {
  id: number;
  type?: number;
  name: string;
  name_cn?: string;
  summary?: string;
  /** v0 endpoints */
  date?: string;
  /** legacy /calendar endpoint */
  air_date?: string;
  air_weekday?: number;
  platform?: string;
  eps?: number;
  rating?: {
    rank?: number;
    total?: number;
    score?: number;
  };
  /** legacy /calendar endpoint */
  rank?: number | null;
  images?: BangumiImages | null;
  collection?: { doing?: number; wish?: number; collect?: number };
}

export interface BangumiCalendarDay {
  weekday: { en: string; cn: string; ja: string; id: number };
  items: BangumiSubject[];
}

export interface BangumiSearchResponse {
  total: number;
  limit: number;
  offset: number;
  data: BangumiSubject[];
}

export interface BangumiSearchFilter {
  type?: number[];
  air_date?: string[];
  rank?: string[];
  tag?: string[];
  nsfw?: boolean;
}

class BangumiAPI extends ExternalAPI {
  constructor() {
    super(
      'https://api.bgm.tv',
      {},
      {
        headers: {
          'User-Agent':
            'RandomHuang/seerr-nas (https://github.com/RandomHuang/seerr)',
        },
        timeout: 20000,
        nodeCache: cacheManager.getCache('bangumi').data,
        rateLimit: { maxRPS: 5, maxRequests: 20 },
      }
    );
  }

  public async getCalendar(): Promise<BangumiCalendarDay[]> {
    return this.get<BangumiCalendarDay[]>('/calendar', undefined, 3600);
  }

  public async searchSubjects({
    keyword = '',
    sort = 'match',
    filter = {},
    limit = 30,
    offset = 0,
  }: {
    keyword?: string;
    sort?: 'match' | 'heat' | 'rank' | 'score';
    filter?: BangumiSearchFilter;
    limit?: number;
    offset?: number;
  }): Promise<BangumiSearchResponse> {
    return this.post<BangumiSearchResponse>(
      '/v0/search/subjects',
      { keyword, sort, filter: { nsfw: false, ...filter } },
      { params: { limit, offset } },
      3600
    );
  }

  public async getSubject(id: number): Promise<BangumiSubject> {
    return this.get<BangumiSubject>(`/v0/subjects/${id}`, undefined, 86400);
  }
}

export default BangumiAPI;
