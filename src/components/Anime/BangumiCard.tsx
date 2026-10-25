import { SmallLoadingSpinner } from '@app/components/Common/LoadingSpinner';
import useToasts from '@app/hooks/useToasts';
import defineMessages from '@app/utils/defineMessages';
import { ArrowTopRightOnSquareIcon, StarIcon } from '@heroicons/react/24/solid';
import type { BangumiItem, BangumiMatch } from '@server/lib/bangumi';
import axios from 'axios';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Anime.BangumiCard', {
  nomatch:
    'Could not find <strong>{title}</strong> on TMDB. Try searching for it instead.',
  matcherror: 'Could not look up <strong>{title}</strong>. Please try again.',
  rank: 'Rank #{rank}',
  openbangumi: 'Open on Bangumi',
});

interface BangumiCardProps {
  item: BangumiItem;
  /** Show the ranking position badge instead of the platform */
  showRank?: boolean;
}

const BangumiCard = ({ item, showRank = false }: BangumiCardProps) => {
  const intl = useIntl();
  const router = useRouter();
  const { addToast } = useToasts();
  const [matching, setMatching] = useState(false);

  const strong = (msg: React.ReactNode) => <strong>{msg}</strong>;

  // Bangumi has no TMDB ids: resolve on click, then open Seerr's own detail page to request
  const open = async () => {
    if (matching) return;
    setMatching(true);
    try {
      const { data } = await axios.get<BangumiMatch>(
        `/api/v1/bangumi/subject/${item.id}/match`
      );
      if (data.tmdbId && data.mediaType) {
        router.push(`/${data.mediaType}/${data.tmdbId}`);
        return;
      }
      addToast(
        <span>
          {intl.formatMessage(messages.nomatch, { title: item.nameCn, strong })}
        </span>,
        { appearance: 'warning', autoDismiss: true }
      );
      router.push(`/search?query=${encodeURIComponent(item.nameCn)}`);
    } catch {
      addToast(
        <span>
          {intl.formatMessage(messages.matcherror, {
            title: item.nameCn,
            strong,
          })}
        </span>,
        { appearance: 'error', autoDismiss: true }
      );
    } finally {
      setMatching(false);
    }
  };

  return (
    <div className="w-full">
      <div
        className="relative cursor-pointer overflow-hidden rounded-xl bg-gray-800 shadow ring-1 ring-gray-700 transition duration-300 hover:scale-105 hover:shadow-lg hover:ring-gray-500"
        style={{ paddingBottom: '150%' }}
        onClick={open}
        onKeyDown={(e) => e.key === 'Enter' && open()}
        role="link"
        tabIndex={0}
      >
        {item.poster ? (
          // Bangumi covers come from lain.bgm.tv, outside the Next image allow-list
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.poster}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-2 text-center text-sm text-gray-400">
            {item.nameCn}
          </div>
        )}
        <div className="absolute left-0 right-0 top-0 flex items-start justify-between p-2">
          <span className="rounded-full border border-pink-500 bg-pink-600/80 px-2 text-xs font-medium leading-5 text-white">
            {showRank && item.rank
              ? intl.formatMessage(messages.rank, { rank: item.rank })
              : item.platform || 'TV'}
          </span>
          {!!item.score && (
            <span className="flex items-center rounded-full bg-gray-900/80 px-1.5 text-xs font-semibold leading-5 text-yellow-400">
              <StarIcon className="mr-0.5 h-3 w-3" />
              {item.score.toFixed(1)}
            </span>
          )}
        </div>
        <a
          href={`https://bgm.tv/subject/${item.id}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={intl.formatMessage(messages.openbangumi)}
          className="absolute bottom-2 right-2 rounded-full bg-gray-900/70 p-1 text-gray-300 hover:text-white"
        >
          <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
        </a>
        {matching && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/70">
            <SmallLoadingSpinner />
          </div>
        )}
      </div>
      <div className="mt-1.5 px-0.5" title={item.name}>
        <div className="truncate text-sm font-medium text-white">
          {item.nameCn}
        </div>
        <div className="h-4 truncate text-xs text-gray-400">{item.date}</div>
      </div>
    </div>
  );
};

export default BangumiCard;
