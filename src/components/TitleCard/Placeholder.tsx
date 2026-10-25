interface PlaceholderProps {
  canExpand?: boolean;
}

const Placeholder = ({ canExpand = false }: PlaceholderProps) => {
  return (
    <div
      className={`animate-pulse ${canExpand ? 'w-full' : 'w-36 sm:w-36 md:w-44'}`}
    >
      <div
        className="relative w-full rounded-xl bg-gray-700"
        style={{ paddingBottom: '150%' }}
      />
      {/* Same height as the title / year caption on TitleCard */}
      <div className="mt-1.5 space-y-1.5 px-0.5">
        <div className="h-3.5 w-3/4 rounded bg-gray-700" />
        <div className="h-3 w-1/4 rounded bg-gray-700" />
      </div>
    </div>
  );
};

export default Placeholder;
