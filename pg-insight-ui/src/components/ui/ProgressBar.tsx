import { cn } from '@/lib/format'

interface ProgressBarProps {
  value: number
  max?: number
  size?: 'xs' | 'sm' | 'md'
  colorFn?: (pct: number) => string
  className?: string
}

export function ProgressBar({ value, max = 100, size = 'sm', colorFn, className }: ProgressBarProps) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100)
  const h = { xs: 'h-1', sm: 'h-1.5', md: 'h-2.5' }[size]
  const color = colorFn
    ? colorFn(pct)
    : pct >= 90 ? '#ef4444' : pct >= 75 ? '#eab308' : pct >= 50 ? '#3b82f6' : '#22c55e'

  return (
    <div className={className}>
      <div className={cn('w-full rounded-full bg-slate-100 dark:bg-slate-700', h)}>
        <div
          className={cn('rounded-full transition-all duration-700', h)}
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}