import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'

export type ColumnAlign = 'left' | 'center' | 'right'

export interface DataTableColumn<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  align?: ColumnAlign
  headerClassName?: string
  cellClassName?: string
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  loading?: boolean
  skeletonRows?: number
  /** Rendered in place of the body when there is nothing to show. */
  empty?: ReactNode
  /** Optional panel header (title, search, actions) above the scroll area. */
  header?: ReactNode
  footer?: ReactNode
  /** Tailwind min-width for the table, so narrow screens can scroll sideways. */
  minWidthClassName?: string
  /** Override the max height of the scroll viewport (and thus sticky header). */
  scrollHeightClassName?: string
  className?: string
}

/**
 * Column alignment is logical: `left` is the inline-start edge and `right` the
 * inline-end edge, so in the RTL admin the "left" column reads from the right
 * and numbers/amounts stay flush against the end (left) edge.
 */
const ALIGN_CLASSES: Record<ColumnAlign, string> = {
  left: 'text-start',
  center: 'text-center',
  right: 'text-end',
}

const SKELETON_WIDTHS = ['w-32', 'w-24', 'w-28', 'w-20', 'w-16', 'w-36']

/**
 * Dense, scrollable admin table inside a card.
 *
 * - sticky header lives inside its own scroll viewport
 * - horizontal scrolling at ≤1024px via `minWidthClassName`
 * - skeleton rows / empty slot keep every list page consistent
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  skeletonRows = 6,
  empty,
  header,
  footer,
  minWidthClassName,
  scrollHeightClassName,
  className,
}: DataTableProps<T>) {
  return (
    <Card padded={false} className={cn('overflow-hidden', className)}>
      {header ? <div className="border-b border-tg-separator px-5 py-4">{header}</div> : null}

      <div className={cn('max-h-[min(72dvh,44rem)] overflow-auto', scrollHeightClassName)}>
        <table className={cn('w-full border-collapse align-middle text-sm', minWidthClassName)}>
          <thead className="sticky top-0 z-10 bg-tg-bg/90 backdrop-blur">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'whitespace-nowrap border-b border-tg-separator px-5 py-3 text-[11px] font-semibold text-tg-hint',
                    ALIGN_CLASSES[column.align ?? 'left'],
                    column.headerClassName,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-tg-separator">
            {loading ? (
              Array.from({ length: skeletonRows }).map((_, rowIndex) => (
                <tr key={`skeleton-row-${rowIndex}`}>
                  {columns.map((column, columnIndex) => (
                    <td
                      key={column.key}
                      className={cn('px-5 py-4', ALIGN_CLASSES[column.align ?? 'left'])}
                    >
                      <Skeleton
                        className={cn(
                          'h-3.5',
                          ALIGN_CLASSES[column.align ?? 'left'] === 'text-end' && 'ms-auto',
                          SKELETON_WIDTHS[(rowIndex + columnIndex) % SKELETON_WIDTHS.length],
                        )}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-4">
                  {empty ?? (
                    <p className="py-6 text-center text-[13px] text-tg-hint">
                      هنوز موردی برای نمایش نیست.
                    </p>
                  )}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={rowKey(row)} className="transition-colors hover:bg-tg-secondary-bg/60">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        'px-5 py-4 align-middle',
                        ALIGN_CLASSES[column.align ?? 'left'],
                        column.cellClassName,
                      )}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {footer ? <div className="border-t border-tg-separator px-5 py-3">{footer}</div> : null}
    </Card>
  )
}
