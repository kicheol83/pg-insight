import { useState } from 'react'
import { Wifi, RefreshCw, Filter, XCircle, TrendingUp, Monitor, User } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { TopBar } from '@/components/layout/TopBar'
import { PageContent } from '@/components/layout/AppLayout'
import {
  Card, CardHeader, Badge, Button, DataTable, EmptyState,
  ProgressBar, Select, LiveDot, TargetSelector,
} from '@/components/ui'
import { useQuery } from '@/hooks/useQuery'
import { useActiveTarget } from '@/store/app'
import { liveApi, metricsApi } from '@/api/endpoints'
import { fmtMs, fmtRelative, tickTime, cn } from '@/lib/format'
import { utilizationColor, utilizationBarColor } from '@/lib/colors'
import type { Session } from '@/types/model'

function StateBadge({ state }: { state: string }) {
  if (state === 'active') return <Badge variant="success" size="xs" dot>active</Badge>
  if (state.startsWith('idle in transaction')) return <Badge variant="error" size="xs" dot>idle in tx</Badge>
  if (state === 'idle') return <Badge variant="default" size="xs">idle</Badge>
  return <Badge variant="warning" size="xs">{state}</Badge>
}

function WaitEventBadge({ type, event }: { type: string | null; event: string | null }) {
  if (!type) return <span className="text-muted text-xs">—</span>
  const variant = type === 'Lock' ? 'error' : type === 'IO' ? 'warning' : 'info'
  return <Badge variant={variant} size="xs">{type}{event ? `:${event}` : ''}</Badge>
}

export default function ConnectionsPage() {
  const { activeTargetId } = useActiveTarget()
  const [minDuration, setMinDuration] = useState(0)
  const [stateFilter, setStateFilter] = useState('')
  const [search, setSearch] = useState('')

  const { data, loading, refetch, updatedAt } = useQuery(
    () => liveApi.connections(activeTargetId ?? '', minDuration),
    { refreshInterval: 5_000, enabled: !!activeTargetId },
  )
  const { data: trend } = useQuery(
    () => metricsApi.connectionTrend(activeTargetId ?? '', 1, 1),
    { refreshInterval: 30_000, enabled: !!activeTargetId },
  )

  const sessions = (data?.sessions ?? []).filter(s => {
    if (stateFilter && !s.state.startsWith(stateFilter)) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        s.username.toLowerCase().includes(q) ||
        s.applicationName.toLowerCase().includes(q) ||
        (s.query ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  const pct = data?.connectionUsagePct ?? 0

  return (
    <>
      <TopBar
        title="Connections"
        subtitle={updatedAt ? `Updated ${fmtRelative(updatedAt)}` : 'Live session monitoring'}
        actions={
          <div className="flex items-center gap-2">
            <LiveDot size="xs" />
            <span className="text-xs text-muted hidden sm:block">5s</span>
            <Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} onClick={refetch} loading={loading}>
              Refresh
            </Button>
          </div>
        }
      />
      <PageContent>
        <div className="flex items-center gap-3 mb-5">
          <TargetSelector />
          {(data?.waitingForLock ?? 0) > 0 && (
            <Badge variant="error" size="sm" dot>{data?.waitingForLock} waiting for lock</Badge>
          )}
          {(data?.idleInTransaction ?? 0) > 0 && (
            <Badge variant="warning" size="sm">{data?.idleInTransaction} idle in tx</Badge>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
          {[
            { label: 'Total', value: data?.totalConnections ?? 0, color: '' },
            { label: 'Active', value: data?.activeQueries ?? 0, color: 'text-green-400' },
            { label: 'Idle', value: data?.idleConnections ?? 0, color: 'text-slate-400' },
            { label: 'Idle in tx', value: data?.idleInTransaction ?? 0, color: (data?.idleInTransaction ?? 0) > 0 ? 'text-red-400' : '' },
            { label: 'Lock wait', value: data?.waitingForLock ?? 0, color: (data?.waitingForLock ?? 0) > 0 ? 'text-red-400' : '' },
            { label: 'Max allowed', value: data?.maxConnections ?? 0, color: 'text-muted' },
          ].map(s => (
            <Card key={s.label} padding="sm">
              <div className="text-[10px] text-muted uppercase tracking-wide mb-1">{s.label}</div>
              <div className={cn('text-xl font-bold tabular-nums', s.color || 'text-primary')}>
                {loading && !data ? '—' : s.value}
              </div>
            </Card>
          ))}
        </div>

        {/* Utilization bar */}
        <Card padding="sm" className="mb-5">
          <div className="flex items-center gap-4">
            <div className="shrink-0">
              <div className="text-xs text-muted mb-0.5">Pool utilization</div>
              <div className={cn('text-2xl font-bold tabular-nums', utilizationColor(pct))}>{pct.toFixed(0)}%</div>
            </div>
            <div className="flex-1">
              <ProgressBar value={pct} size="md" colorFn={utilizationBarColor} />
              <div className="flex justify-between mt-1 text-[10px] text-muted">
                <span>{data?.totalConnections ?? 0} used</span>
                <span>{data?.maxConnections ?? 0} max</span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-xs text-muted mb-0.5">Longest query</div>
              <div className={cn('text-sm font-bold', (data?.longestQueryMs ?? 0) > 30000 ? 'text-red-400' : 'text-primary')}>
                {fmtMs(data?.longestQueryMs ?? 0)}
              </div>
            </div>
          </div>
        </Card>

        {/* Trend + by app */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-5 mb-5">
          <Card className="xl:col-span-3">
            <CardHeader title="Connection trend (1h)" icon={<TrendingUp size={15} />} />
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={trend ?? []}>
                <defs>
                  <linearGradient id="connG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" tickFormatter={tickTime} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Area type="monotone" dataKey="total" name="Total" stroke="#0ea5e9" fill="url(#connG)" strokeWidth={1.5} dot={false} />
                <Area type="monotone" dataKey="active" name="Active" stroke="#22c55e" fill="none" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <CardHeader title="By application" icon={<Monitor size={15} />} />
            <div className="space-y-2">
              {(data?.byApplication ?? []).slice(0, 8).map(app => (
                <div key={app.applicationName}>
                  <div className="flex justify-between mb-0.5">
                    <span className="text-xs text-secondary truncate">{app.applicationName || '(unknown)'}</span>
                    <span className="text-xs font-bold text-primary ml-2">{app.count}</span>
                  </div>
                  <ProgressBar value={app.count} max={data?.totalConnections || 1} size="xs" colorFn={() => '#0ea5e9'} />
                </div>
              ))}
              {!data?.byApplication?.length && <EmptyState title="No data" />}
            </div>
          </Card>
        </div>

        {/* Sessions table */}
        <Card>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <CardHeader title="Active sessions" icon={<User size={15} />} className="mb-0 flex-1" />
            <div className="flex items-center gap-2 flex-wrap">
              <Select
                value={stateFilter}
                onChange={setStateFilter}
                placeholder="All states"
                className="w-40"
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'idle in transaction', label: 'Idle in tx' },
                  { value: 'idle', label: 'Idle' },
                ]}
              />
              <Select
                value={String(minDuration)}
                onChange={v => setMinDuration(Number(v))}
                className="w-40"
                options={[
                  { value: '0', label: 'All durations' },
                  { value: '1000', label: '> 1s' },
                  { value: '5000', label: '> 5s' },
                  { value: '30000', label: '> 30s' },
                ]}
              />
              <div className="relative">
                <Filter size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search user, app, query…"
                  className="input pl-8 w-52 text-xs"
                />
              </div>
              {(stateFilter || search || minDuration > 0) && (
                <Button
                  size="xs" variant="ghost" icon={<XCircle size={12} />}
                  onClick={() => { setStateFilter(''); setSearch(''); setMinDuration(0) }}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          <DataTable<Session>
            loading={loading && !data}
            data={sessions}
            keyFn={s => s.pid}
            emptyMsg="No sessions match the filter"
            rowClassName={s =>
              s.isIdleInTx ? 'bg-red-50/50 dark:bg-red-500/5' :
              s.isWaitingForLock ? 'bg-orange-50/50 dark:bg-orange-500/5' :
              s.isLongRunning ? 'bg-yellow-50/50 dark:bg-yellow-500/5' : ''
            }
            columns={[
              { key: 'pid', header: 'PID', width: '70px', render: s => <span className="mono text-xs text-primary">{s.pid}</span> },
              { key: 'state', header: 'State', width: '140px', render: s => <StateBadge state={s.state} /> },
              {
                key: 'user', header: 'User / App',
                render: s => (
                  <div>
                    <div className="text-xs font-medium text-primary">{s.username}</div>
                    <div className="text-[10px] text-muted">{s.applicationName || '—'}</div>
                  </div>
                ),
              },
              { key: 'wait', header: 'Wait event', width: '160px', render: s => <WaitEventBadge type={s.waitEventType} event={s.waitEvent} /> },
              {
                key: 'duration', header: 'Duration', width: '100px', align: 'right',
                render: s => (
                  <span className={cn(
                    'text-xs mono font-medium',
                    s.queryDurationMs > 30000 ? 'text-red-400' : s.queryDurationMs > 5000 ? 'text-yellow-400' : 'text-primary',
                  )}>
                    {s.queryDurationMs > 0 ? fmtMs(s.queryDurationMs) : '—'}
                  </span>
                ),
              },
              {
                key: 'query', header: 'Query',
                render: s => (
                  <div className="text-xs mono text-secondary truncate max-w-[300px]" title={s.query ?? ''}>
                    {s.query ? s.query.replace(/\s+/g, ' ').slice(0, 120) : '—'}
                  </div>
                ),
              },
              { key: 'client', header: 'Client', width: '110px', render: s => <span className="text-xs text-muted mono">{s.clientAddr ?? 'local'}</span> },
            ]}
          />
          <div className="text-xs text-muted mt-3 pt-3 border-t border-[var(--border)]">
            Showing {sessions.length} of {data?.sessions?.length ?? 0} sessions
          </div>
        </Card>
      </PageContent>
    </>
  )
}