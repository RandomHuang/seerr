import BangumiCard from '@app/components/Anime/BangumiCard';
import Button from '@app/components/Common/Button';
import Header from '@app/components/Common/Header';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { BangumiItem } from '@server/lib/bangumi';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';

const messages = defineMessages('components.Anime', {
  anime: 'Anime',
  subtext: 'Data from Bangumi. Pick a title to request it.',
  calendar: 'Airing Schedule',
  season: 'This Season',
  ranking: 'Top Ranked',
  seasontitle:
    '{year} {month, select, 1 {Winter} 4 {Spring} 7 {Summer} other {Fall}}',
  loadmore: 'Load More',
  empty: 'Nothing here yet.',
  today: 'Today',
});

type Tab = 'calendar' | 'season' | 'ranking';
const TABS: Tab[] = ['calendar', 'season', 'ranking'];

interface CalendarDay {
  weekday: { id: number; cn: string };
  items: BangumiItem[];
}

interface BangumiPage {
  page: number;
  totalPages: number;
  totalResults: number;
  season?: { year: number; month: number };
  results: BangumiItem[];
}

const Grid = ({
  items,
  showRank,
}: {
  items: BangumiItem[];
  showRank?: boolean;
}) => (
  <ul className="cards-vertical">
    {items.map((item) => (
      <li key={item.id}>
        <BangumiCard item={item} showRank={showRank} />
      </li>
    ))}
  </ul>
);

const Calendar = () => {
  const intl = useIntl();
  const { data, error } = useSWR<CalendarDay[]>('/api/v1/bangumi/calendar');
  // Bangumi weekday ids run 1 (Mon) .. 7 (Sun)
  const today = ((new Date().getDay() + 6) % 7) + 1;
  const [day, setDay] = useState(today);

  if (error) return <ErrorPage statusCode={502} />;
  if (!data) return <LoadingSpinner />;

  const items = data.find((d) => d.weekday.id === day)?.items ?? [];
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {data.map((d) => (
          <button
            key={d.weekday.id}
            onClick={() => setDay(d.weekday.id)}
            className={`rounded-full px-3 py-1 text-sm transition ${
              d.weekday.id === day
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {d.weekday.id === today
              ? intl.formatMessage(messages.today)
              : d.weekday.cn}
            <span className="ml-1 text-xs opacity-60">{d.items.length}</span>
          </button>
        ))}
      </div>
      {items.length ? (
        <Grid items={items} />
      ) : (
        <p className="text-gray-400">{intl.formatMessage(messages.empty)}</p>
      )}
    </>
  );
};

const Paged = ({
  endpoint,
  showRank,
}: {
  endpoint: string;
  showRank?: boolean;
}) => {
  const intl = useIntl();
  const { data, error, size, setSize, isValidating } =
    useSWRInfinite<BangumiPage>(
      (index, previous) =>
        previous && previous.page >= previous.totalPages
          ? null
          : `${endpoint}?page=${index + 1}`,
      { revalidateFirstPage: false }
    );

  if (error) return <ErrorPage statusCode={502} />;
  if (!data) return <LoadingSpinner />;

  const items = data.flatMap((p) => p.results);
  const last = data[data.length - 1];
  const season = data[0].season;
  return (
    <>
      {season && (
        <p className="mb-4 text-gray-400">
          {intl.formatMessage(messages.seasontitle, season)}
        </p>
      )}
      <Grid items={items} showRank={showRank} />
      {last.page < last.totalPages && (
        <div className="mt-6 flex justify-center">
          <Button
            onClick={() => setSize(size + 1)}
            disabled={isValidating}
            buttonType="ghost"
          >
            {intl.formatMessage(messages.loadmore)}
          </Button>
        </div>
      )}
    </>
  );
};

const Anime = () => {
  const intl = useIntl();
  const router = useRouter();
  const tab: Tab = TABS.includes(router.query.tab as Tab)
    ? (router.query.tab as Tab)
    : 'calendar';

  return (
    <>
      <PageTitle title={intl.formatMessage(messages.anime)} />
      <div className="mb-4">
        <Header subtext={intl.formatMessage(messages.subtext)}>
          {intl.formatMessage(messages.anime)}
        </Header>
      </div>
      <div className="mb-6 flex gap-1 border-b border-gray-700">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() =>
              router.replace(
                { query: { ...router.query, tab: t } },
                undefined,
                {
                  shallow: true,
                }
              )
            }
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {intl.formatMessage(messages[t])}
          </button>
        ))}
      </div>
      {tab === 'calendar' && <Calendar />}
      {tab === 'season' && <Paged endpoint="/api/v1/bangumi/season" />}
      {tab === 'ranking' && (
        <Paged endpoint="/api/v1/bangumi/ranking" showRank />
      )}
    </>
  );
};

export default Anime;
