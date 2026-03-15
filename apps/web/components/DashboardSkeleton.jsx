export default function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="skeleton-block h-24 rounded-2xl" />
        <div className="skeleton-block h-24 rounded-2xl" />
        <div className="skeleton-block h-24 rounded-2xl" />
        <div className="skeleton-block h-24 rounded-2xl" />
      </div>

      <div className="skeleton-block h-36 rounded-[24px]" />
      <div className="skeleton-block h-36 rounded-[24px]" />
      <div className="skeleton-block h-36 rounded-[24px]" />

      <div className="grid grid-cols-2 gap-3">
        <div className="skeleton-block h-20 rounded-xl" />
        <div className="skeleton-block h-20 rounded-xl" />
        <div className="skeleton-block h-20 rounded-xl" />
        <div className="skeleton-block h-20 rounded-xl" />
      </div>

      <div className="skeleton-block h-36 rounded-[24px]" />
    </div>
  );
}