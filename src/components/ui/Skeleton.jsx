import { clsx } from 'clsx'

export const Skeleton = ({ className }) => (
  <div className={clsx(
    'animate-pulse rounded-md bg-gradient-to-r from-elevated via-muted/50 to-elevated bg-[length:400px_100%]',
    className
  )} />
)

export const StockCardSkeleton = () => (
  <div className="bg-card border border-subtle rounded-xl p-4 space-y-3">
    <div className="flex items-start justify-between">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-36" />
      </div>
      <Skeleton className="h-7 w-14 rounded-lg" />
    </div>
    <div className="flex items-end justify-between">
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-4 w-16" />
    </div>
    <Skeleton className="h-1.5 w-full rounded-full" />
    <div className="flex gap-2">
      <Skeleton className="h-8 flex-1 rounded-lg" />
      <Skeleton className="h-8 w-8 rounded-lg" />
    </div>
  </div>
)

export const IndexCardSkeleton = () => (
  <div className="bg-card border border-subtle rounded-xl p-4 space-y-2">
    <Skeleton className="h-3 w-20" />
    <Skeleton className="h-8 w-32" />
    <Skeleton className="h-4 w-16" />
    <Skeleton className="h-12 w-full rounded" />
  </div>
)
