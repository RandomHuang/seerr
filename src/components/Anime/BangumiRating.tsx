import Tooltip from '@app/components/Common/Tooltip';
import defineMessages from '@app/utils/defineMessages';
import type { BangumiRating as Rating } from '@server/lib/bangumi';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Anime.BangumiRating', {
  bangumiscore: 'Bangumi Score',
  rank: 'Rank #{rank}',
});

const ANIMATION_GENRE = 16;

interface BangumiRatingProps {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  genres: { id: number }[];
}

/** Bangumi score on movie / series detail pages, only for animation */
const BangumiRating = ({ mediaType, tmdbId, genres }: BangumiRatingProps) => {
  const intl = useIntl();
  const isAnimation = genres.some((g) => g.id === ANIMATION_GENRE);
  const { data } = useSWR<Rating>(
    isAnimation
      ? `/api/v1/bangumi/rating?mediaType=${mediaType}&tmdbId=${tmdbId}`
      : null,
    { shouldRetryOnError: false, revalidateOnFocus: false }
  );

  if (!data?.score) return null;

  return (
    <div className="media-ratings">
      <Tooltip content={intl.formatMessage(messages.bangumiscore)}>
        <a
          href={data.url}
          className="media-rating"
          target="_blank"
          rel="noreferrer"
        >
          <span className="mr-1.5 rounded bg-pink-600 px-1 text-xs font-bold text-white">
            bgm
          </span>
          <span>{data.score.toFixed(1)}</span>
          {!!data.rank && (
            <span className="ml-1.5 text-xs text-gray-400">
              {intl.formatMessage(messages.rank, { rank: data.rank })}
            </span>
          )}
        </a>
      </Tooltip>
    </div>
  );
};

export default BangumiRating;
