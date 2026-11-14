import { TriangleAlert, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export interface AdminErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
  className?: string
}

/** Inline failure panel used when a mocked/live request rejects. */
export function AdminErrorState({
  title = 'بارگیری این صفحه ممکن نشد',
  message,
  onRetry,
  className,
}: AdminErrorStateProps) {
  return (
    <Card className={cn(className)}>
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
          <TriangleAlert className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-tg-text">{title}</p>
          <p className="mt-0.5 text-[13px] text-tg-hint">{message}</p>
        </div>
        {onRetry ? (
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw className="size-4" />}
            onClick={onRetry}
          >
            {fa.common.retry}
          </Button>
        ) : null}
      </div>
    </Card>
  )
}
