import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** Animated placeholder block used while data is loading. */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-lg bg-black/[0.07]', className)}
      {...rest}
    />
  )
}

/** A stack of skeleton lines for paragraph placeholders. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn('h-3.5', index === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  )
}
