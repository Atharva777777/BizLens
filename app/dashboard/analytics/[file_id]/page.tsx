'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Lightbulb,
  BarChart2,
  FileSearch,
  Clock,
  CheckCircle2,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { apiAnalytics } from '@/lib/api/analytics'
import { apiFiles } from '@/lib/api/files'
import {
  AIBusinessBrief,
  FileMetrics,
  Insight,
  NormalizedFact,
  VerificationRecord,
  VerificationStatus,
} from '@/lib/types/analytics'
import { FileRecord } from '@/lib/types/file'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatPercent(value: number | null): string {
  if (value === null) return 'N/A'
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100)
}

function shortCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value}`
}

// ── Verification Status Badge ─────────────────────────────────────────────────

function VerificationStatusBadge({ status }: { status: VerificationStatus }) {
  if (status === 'VERIFIED') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-1 text-xs font-medium text-success ring-1 ring-inset ring-success/20">
        <CheckCircle2 className="h-3 w-3" /> Verified
      </span>
    )
  }
  if (status === 'NEEDS_REVIEW') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-warning/10 px-2 py-1 text-xs font-medium text-warning ring-1 ring-inset ring-warning/20">
        <AlertCircle className="h-3 w-3" /> Needs Review
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-muted px-2 py-1 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border">
      Unable to Verify
    </span>
  )
}

// ── Verification header badge (correctly reads record statuses) ───────────────

function VerificationHeaderBadge({ records }: { records: VerificationRecord[] | null }) {
  if (!records) return null
  if (records.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-muted px-2 py-1 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border">
        <Clock className="h-3 w-3" /> Verification: Not run
      </span>
    )
  }
  const hasIssues = records.some(r => r.status !== 'VERIFIED')
  if (hasIssues) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-warning/10 px-2 py-1 text-xs font-medium text-warning ring-1 ring-inset ring-warning/20">
        <AlertCircle className="h-3 w-3" /> Verification: Needs Review
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-1 text-xs font-medium text-success ring-1 ring-inset ring-success/20">
      <ShieldCheck className="h-3 w-3" /> Verification: Passed
    </span>
  )
}

// ── Evidence inline panel ─────────────────────────────────────────────────────

function EvidencePanel({
  fileId,
  canonicalName,
  factCount,
}: {
  fileId: string
  canonicalName: string
  factCount: number
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [facts, setFacts] = useState<NormalizedFact[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleOpen = async () => {
    if (!isOpen && facts.length === 0 && factCount > 0) {
      setIsLoading(true)
      setError(null)
      try {
        const data = await apiAnalytics.getEvidenceFacts(fileId, canonicalName)
        setFacts(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load evidence.')
      } finally {
        setIsLoading(false)
      }
    }
    setIsOpen(!isOpen)
  }

  if (factCount === 0) return null

  return (
    <div className="mt-5 pt-4 border-t border-border">
      <button
        onClick={toggleOpen}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {isOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        {isOpen ? 'Hide evidence' : `View evidence (${factCount} fact${factCount !== 1 ? 's' : ''})`}
      </button>
      {isOpen && (
        <div className="mt-3 rounded-lg border border-border bg-surface-muted overflow-hidden animate-in fade-in duration-200">
          {isLoading ? (
            <div className="flex items-center justify-center p-6">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="p-4 text-xs text-danger">{error}</div>
          ) : facts.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground">No contributing facts found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-surface border-b border-border text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Source Row</th>
                    <th className="px-4 py-2 font-medium">Category</th>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {facts.map((fact) => (
                    <tr key={fact.id} className="hover:bg-surface transition-colors">
                      <td className="px-4 py-2 text-muted-foreground tabular-nums">Row {fact.row_number}</td>
                      <td className="px-4 py-2">{fact.category || '—'}</td>
                      <td className="px-4 py-2">{fact.date_value || '—'}</td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">
                        {fact.value_numeric !== null ? formatCurrency(fact.value_numeric) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Insight Card ──────────────────────────────────────────────────────────────

const INSIGHT_ICONS: Record<string, React.ReactNode> = {
  revenue: <TrendingUp className="size-4 text-success" />,
  expense: <TrendingDown className="size-4 text-danger" />,
  net_profit: <DollarSign className="size-4 text-primary" />,
  operating_margin: <Activity className="size-4 text-accent" />,
  data_quality: <AlertCircle className="size-4 text-warning" />,
}

function formatSupportingValue(metric: string, value: number | null): string | null {
  if (value === null) return null
  if (metric === 'operating_margin') return `${value.toFixed(2)}%`
  return formatCurrency(value)
}

function InsightCard({ insight }: { insight: Insight }) {
  const icon = INSIGHT_ICONS[insight.metric] ?? <Lightbulb className="size-4 text-muted-foreground" />
  const formattedValue = formatSupportingValue(insight.metric, insight.supporting_value)
  return (
    <div className="rounded-xl border border-border bg-surface p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold text-foreground">{insight.label}</span>
        </div>
        {formattedValue && (
          <span className="shrink-0 text-xs font-mono font-medium text-muted-foreground bg-surface-muted px-2 py-0.5 rounded border border-border">
            {formattedValue}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{insight.observation}</p>
    </div>
  )
}

// ── Tab types ─────────────────────────────────────────────────────────────────

type Tab = 'metrics' | 'insights' | 'verification'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'metrics', label: 'Metrics', icon: <BarChart2 className="size-3.5" /> },
  { id: 'insights', label: 'Insights', icon: <Lightbulb className="size-3.5" /> },
  { id: 'verification', label: 'Verification', icon: <ShieldCheck className="size-3.5" /> },
]

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const params = useParams()
  const fileId = params.file_id as string

  const [metrics, setMetrics] = useState<FileMetrics | null>(null)
  const [file, setFile] = useState<FileRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<{ message: string; status?: number } | null>(null)

  const [activeTab, setActiveTab] = useState<Tab>('metrics')

  const [insights, setInsights] = useState<Insight[] | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState<string | null>(null)

  const [verificationRecords, setVerificationRecords] = useState<VerificationRecord[] | null>(null)
  const [verificationLoading, setVerificationLoading] = useState(false)
  const [verificationRunning, setVerificationRunning] = useState(false)
  const [verificationError, setVerificationError] = useState<string | null>(null)

  const [brief, setBrief] = useState<AIBusinessBrief | null>(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const [briefError, setBriefError] = useState<string | null>(null)
  const briefGeneratedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!fileId) return
    const loadData = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const [fileData, metricsData, verificationData] = await Promise.all([
          apiFiles.getFile(fileId),
          apiAnalytics.getFileMetrics(fileId),
          apiAnalytics.getVerificationRecords(fileId).catch(() => null),
        ])
        setFile(fileData)
        setMetrics(metricsData)
        setVerificationRecords(verificationData ?? [])
      } catch (err: unknown) {
        let status = 500
        const errMessage = err instanceof Error ? err.message : String(err)
        if (errMessage.includes('404')) status = 404
        if (errMessage.includes('409') || errMessage.includes('conflict')) status = 409
        setError({ message: errMessage || 'An unexpected error occurred.', status })
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [fileId])

  const loadInsights = async () => {
    if (insights !== null || insightsLoading) return
    setInsightsLoading(true)
    setInsightsError(null)
    try {
      const data = await apiAnalytics.getInsights(fileId)
      setInsights(data.insights)
    } catch (err) {
      setInsightsError(err instanceof Error ? err.message : 'Failed to load insights.')
    } finally {
      setInsightsLoading(false)
    }
  }

  const loadVerificationRecords = async () => {
    if (verificationLoading) return
    setVerificationLoading(true)
    setVerificationError(null)
    try {
      const records = await apiAnalytics.getVerificationRecords(fileId)
      setVerificationRecords(records)
    } catch (err) {
      setVerificationError(err instanceof Error ? err.message : 'Failed to load verification records.')
    } finally {
      setVerificationLoading(false)
    }
  }

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    if (tab === 'insights') loadInsights()
    if (tab === 'verification') loadVerificationRecords()
  }

  const handleGenerateBrief = async () => {
    if (briefLoading) return
    setBriefLoading(true)
    setBriefError(null)
    setBrief(null)
    try {
      const result = await apiAnalytics.generateBusinessBrief(fileId)
      setBrief(result)
      briefGeneratedRef.current = fileId
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate brief.'
      setBriefError(msg)
    } finally {
      setBriefLoading(false)
    }
  }

  const handleRunVerification = async () => {
    setVerificationRunning(true)
    setVerificationError(null)
    try {
      const records = await apiAnalytics.runVerification(fileId)
      setVerificationRecords(records)
    } catch (err) {
      setVerificationError(err instanceof Error ? err.message : 'Verification failed.')
    } finally {
      setVerificationRunning(false)
    }
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="max-w-4xl animate-in fade-in duration-500">
        <div className="flex items-center gap-2 mb-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading analytics...
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-surface p-6 h-32 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  // ── Error state ───────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="max-w-3xl">
        <Link
          href="/dashboard/analytics"
          className={buttonVariants({ variant: 'ghost', className: 'mb-6 -ml-4 text-muted-foreground' })}
        >
          <ArrowLeft className="mr-2 size-4" /> Back to Analytics
        </Link>
        <div className="rounded-xl border border-border bg-surface p-12 text-center flex flex-col items-center">
          <AlertCircle className="size-10 text-danger mb-4" />
          <h3 className="text-lg font-medium text-foreground">
            {error.status === 404 ? 'Dataset Not Found' : error.status === 409 ? 'Dataset Not Ready' : 'Failed to load analytics'}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md">{error.message}</p>
          <div className="mt-8">
            <Link href="/dashboard/analytics" className={buttonVariants({ variant: 'default' })}>
              Return to Analytics
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!metrics || !file) return null

  const hasZeroFacts = metrics.revenue_fact_count === 0 && metrics.expense_fact_count === 0
  const chartData = [
    { name: 'Revenue', value: metrics.total_revenue },
    { name: 'Expense', value: metrics.total_expense },
  ]

  return (
    <div className="max-w-4xl animate-in fade-in duration-500">

      {/* Page header */}
      <div className="mb-6">
        <Link
          href="/dashboard/analytics"
          className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="mr-1.5 size-4" /> All datasets
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center flex-wrap gap-2.5">
              <h2 className="text-xl font-serif tracking-tight text-foreground">
                {file.original_filename}
              </h2>
              {/* Analytics status */}
              <span className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-1 text-[10px] font-semibold text-success ring-1 ring-inset ring-success/20 uppercase tracking-wider">
                Analytics: {file.status}
              </span>
              {/* Verification status — separate concept */}
              <VerificationHeaderBadge records={verificationRecords} />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Uploaded {new Date(file.created_at).toLocaleDateString([], {
                day: 'numeric', month: 'short', year: 'numeric',
              })}
              {' · '}
              {metrics.revenue_fact_count + metrics.expense_fact_count} facts extracted
            </p>
          </div>

          {!hasZeroFacts && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleRunVerification}
                disabled={verificationRunning}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                {verificationRunning ? (
                  <><Loader2 className="size-4 mr-2 animate-spin" />Running…</>
                ) : (
                  <><ShieldCheck className="size-4 mr-2" />Run Verification</>
                )}
              </button>
              <Link
                href={`/dashboard/evidence/${fileId}`}
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                <FileSearch className="size-4 mr-2" /> Evidence
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Zero facts warning */}
      {hasZeroFacts && (
        <div className="mb-6 rounded-lg bg-warning/5 border border-warning/20 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="size-4 text-warning shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            No recognizable financial facts were detected in this document. Metrics are unavailable until supported financial data is present.
          </p>
        </div>
      )}

      {/* Verification running banner */}
      {verificationRunning && (
        <div className="mb-6 rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 flex items-center gap-3">
          <Loader2 className="size-4 text-primary animate-spin shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">Verification engine running</p>
            <p className="text-xs text-muted-foreground mt-0.5">Independently recalculating each metric from the raw fact records…</p>
          </div>
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-border mb-7">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === tab.id
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── METRICS TAB ───────────────────────────────────────────────────── */}
      {activeTab === 'metrics' && (
        <div className="space-y-6 animate-in fade-in duration-300 slide-in-from-bottom-2">

          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* Revenue */}
            <div className="rounded-xl border border-border bg-surface p-6 flex flex-col hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
                <TrendingUp className="size-4 text-success" /> Total Revenue
              </div>
              {metrics.revenue_fact_count === 0 ? (
                <div>
                  <div className="text-4xl font-serif tracking-tight text-muted-foreground/20">—</div>
                  <div className="mt-1.5 text-xs text-muted-foreground">No revenue data detected</div>
                </div>
              ) : (
                <div className="text-4xl font-serif tracking-tight text-foreground tabular-nums">
                  {formatCurrency(metrics.total_revenue)}
                </div>
              )}
              <div className="flex-1" />
              <EvidencePanel fileId={fileId} canonicalName="revenue" factCount={metrics.revenue_fact_count} />
            </div>

            {/* Expense */}
            <div className="rounded-xl border border-border bg-surface p-6 flex flex-col hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
                <TrendingDown className="size-4 text-danger" /> Total Expense
              </div>
              {metrics.expense_fact_count === 0 ? (
                <div>
                  <div className="text-4xl font-serif tracking-tight text-muted-foreground/20">—</div>
                  <div className="mt-1.5 text-xs text-muted-foreground">No expense data detected</div>
                </div>
              ) : (
                <div className="text-4xl font-serif tracking-tight text-foreground tabular-nums">
                  {formatCurrency(metrics.total_expense)}
                </div>
              )}
              <div className="flex-1" />
              <EvidencePanel fileId={fileId} canonicalName="expense" factCount={metrics.expense_fact_count} />
            </div>

            {/* Net Profit */}
            <div className="rounded-xl border border-border bg-surface p-6 flex flex-col hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
                <DollarSign className="size-4 text-primary" /> Net Profit
              </div>
              {hasZeroFacts ? (
                <div><div className="text-4xl font-serif tracking-tight text-muted-foreground/20">—</div><div className="mt-1.5 text-xs text-muted-foreground">Insufficient data</div></div>
              ) : metrics.expense_fact_count === 0 ? (
                <div><div className="text-4xl font-serif tracking-tight text-muted-foreground/20">—</div><div className="mt-1.5 text-xs text-muted-foreground">No expense data</div></div>
              ) : metrics.revenue_fact_count === 0 ? (
                <div><div className="text-4xl font-serif tracking-tight text-muted-foreground/20">—</div><div className="mt-1.5 text-xs text-muted-foreground">No revenue data</div></div>
              ) : (
                <div className={`text-4xl font-serif tracking-tight tabular-nums ${metrics.net_profit < 0 ? 'text-danger' : 'text-foreground'}`}>
                  {formatCurrency(metrics.net_profit)}
                </div>
              )}
            </div>

            {/* Operating Margin */}
            <div className="rounded-xl border border-border bg-surface p-6 flex flex-col hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
                <Activity className="size-4 text-accent" /> Operating Margin
              </div>
              {metrics.operating_margin === null ? (
                <div><div className="text-4xl font-serif tracking-tight text-muted-foreground/20">—</div><div className="mt-1.5 text-xs text-muted-foreground">Insufficient data</div></div>
              ) : (
                <div className="text-4xl font-serif tracking-tight text-foreground tabular-nums">
                  {formatPercent(metrics.operating_margin)}
                </div>
              )}
              {metrics.operating_margin !== null && (
                <div className="mt-2 text-xs text-muted-foreground">Net profit as a percentage of revenue</div>
              )}
            </div>
          </div>

          {/* Revenue vs Expense chart — only rendered with actual aggregate data */}
          {!hasZeroFacts && (
            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              <div className="px-6 py-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Revenue vs Expense</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Aggregate totals from this dataset — not a time series
                </p>
              </div>
              <div className="p-6">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={chartData} barCategoryGap="40%" margin={{ top: 4, right: 0, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={shortCurrency} tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} width={68} />
                    <Tooltip
                      formatter={(val) => (typeof val === 'number' ? [formatCurrency(val), ''] : [val, ''])}
                      contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '12px' }}
                      cursor={{ fill: 'var(--color-surface-muted)' }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="var(--color-primary)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Data coverage */}
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Data Coverage</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Financial facts extracted and processed from this dataset
              </p>
            </div>
            <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-5">
              <div>
                <div className="text-xs font-medium text-muted-foreground">Total Facts</div>
                <div className="mt-1.5 text-2xl font-semibold text-foreground tabular-nums">
                  {metrics.revenue_fact_count + metrics.expense_fact_count}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Revenue Facts</div>
                <div className="mt-1.5 text-2xl font-semibold text-foreground tabular-nums">{metrics.revenue_fact_count}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Expense Facts</div>
                <div className="mt-1.5 text-2xl font-semibold text-foreground tabular-nums">{metrics.expense_fact_count}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Verification</div>
                <div className="mt-1.5 flex items-center gap-2">
                  {hasZeroFacts ? (
                    <span className="text-sm font-medium text-warning">Unavailable</span>
                  ) : verificationRecords && verificationRecords.length > 0 ? (
                    verificationRecords.every(r => r.status === 'VERIFIED') ? (
                      <span className="text-sm font-medium text-success flex items-center gap-1"><ShieldCheck className="size-4" /> Passed</span>
                    ) : (
                      <span className="text-sm font-medium text-warning flex items-center gap-1"><AlertCircle className="size-4" /> Review</span>
                    )
                  ) : (
                    <span className="text-sm font-medium text-muted-foreground">Not run</span>
                  )}
                </div>
              </div>
            </div>
            <div className="px-6 pb-4 flex justify-end">
              <Link href={`/dashboard/evidence/${fileId}`} className="text-xs font-medium text-primary hover:underline flex items-center gap-1">
                <FileSearch className="size-3" /> View full evidence table
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── INSIGHTS TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'insights' && (
        <div className="space-y-6 animate-in fade-in duration-300 slide-in-from-bottom-2">

          {/* Deterministic Insights */}
          {insightsLoading || insights === null ? (
            <div className="flex items-center justify-center p-14">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : insightsError ? (
            <div className="rounded-xl border border-border bg-surface p-10 text-center flex flex-col items-center">
              <AlertCircle className="size-8 text-danger mb-3" />
              <p className="text-sm text-danger">{insightsError}</p>
            </div>
          ) : insights.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface p-14 text-center flex flex-col items-center">
              <Lightbulb className="size-10 text-muted-foreground mb-4" />
              <h3 className="text-base font-medium text-foreground mb-2">No insights available</h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                The insights engine found no observations. This typically means no financial facts were detected in this dataset.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                  {insights.length} deterministic insight{insights.length !== 1 ? 's' : ''}
                  <span className="font-normal ml-1.5 text-muted-foreground/70">
                    · {metrics.revenue_fact_count + metrics.expense_fact_count} supporting facts
                  </span>
                </p>
              </div>
              {insights.map((insight, idx) => (
                <InsightCard key={`${insight.metric}-${idx}`} insight={insight} />
              ))}
            </div>
          )}

          {/* AI Business Brief */}
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lightbulb className="size-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">AI Business Brief</h3>
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase tracking-wider">AI</span>
              </div>
              {!briefLoading && (
                <button
                  onClick={handleGenerateBrief}
                  disabled={briefLoading}
                  className="text-xs font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                >
                  {brief ? 'Regenerate' : 'Generate Brief'}
                </button>
              )}
            </div>

            <div className="p-5">
              {!brief && !briefLoading && !briefError && (
                <div className="text-center py-8 flex flex-col items-center">
                  <p className="text-sm text-muted-foreground mb-1.5">Let AI explain what the data means.</p>
                  <p className="text-xs text-muted-foreground mb-6 max-w-sm leading-relaxed">
                    Gemini explains the business meaning of your deterministic metrics and insights.
                    No numbers are invented — it only explains what BizLens already computed.
                  </p>
                  <button
                    onClick={handleGenerateBrief}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Lightbulb className="size-4" /> Generate Business Brief
                  </button>
                </div>
              )}

              {briefLoading && (
                <div className="text-center py-8 flex flex-col items-center gap-3">
                  <Loader2 className="size-6 animate-spin text-primary" />
                  <div className="text-sm text-muted-foreground">Preparing analytics context for AI explanation…</div>
                </div>
              )}

              {briefError && !briefLoading && (
                <div className="rounded-lg border border-danger/20 bg-danger/5 p-4 flex items-start gap-3">
                  <AlertCircle className="size-4 text-danger mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-danger">AI brief unavailable</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{briefError}</p>
                    <button onClick={handleGenerateBrief} className="mt-2.5 text-xs font-medium text-primary hover:underline">Try again</button>
                  </div>
                </div>
              )}

              {brief && !briefLoading && (
                <div className="space-y-5 animate-in fade-in duration-300">
                  {/* How this was generated */}
                  <div className="rounded-md bg-surface-muted border border-border px-4 py-3">
                    <p className="text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">How this was generated:</span>
                      {' '}BizLens computed the metrics and insights deterministically from your data.
                      Gemini was given only the computed analytics context — not your raw data — and generated this explanation.
                      Gemini does not calculate, verify, or invent financial values.
                    </p>
                  </div>

                  {/* Executive Summary */}
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Executive Summary</p>
                    <p className="text-sm text-foreground leading-relaxed">{brief.executive_summary}</p>
                  </div>

                  {/* Key Takeaways */}
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Key Takeaways</p>
                    <ul className="space-y-1.5">
                      {brief.key_takeaways.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                          <span className="mt-2 size-1.5 rounded-full bg-primary shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Needs Attention */}
                  {brief.needs_attention.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Needs Attention</p>
                      <ul className="space-y-1.5">
                        {brief.needs_attention.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                            <span className="mt-2 size-1.5 rounded-full bg-warning shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Decision Context */}
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Decision Context</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{brief.decision_context}</p>
                  </div>

                  {/* Provenance tags */}
                  <div className="pt-4 border-t border-border">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2.5">Supported by</p>
                    <div className="flex flex-wrap gap-2">
                      {metrics.revenue_fact_count > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-2 py-1 text-xs font-medium text-success ring-1 ring-inset ring-success/20">
                          <TrendingUp className="size-3" /> {metrics.revenue_fact_count} Revenue facts
                        </span>
                      )}
                      {metrics.expense_fact_count > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-danger/10 px-2 py-1 text-xs font-medium text-danger ring-1 ring-inset ring-danger/20">
                          <TrendingDown className="size-3" /> {metrics.expense_fact_count} Expense facts
                        </span>
                      )}
                      {verificationRecords && verificationRecords.length > 0 ? (
                        verificationRecords.every(r => r.status === 'VERIFIED') ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-2 py-1 text-xs font-medium text-success ring-1 ring-inset ring-success/20">
                            <ShieldCheck className="size-3" /> Verification passed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-warning/10 px-2 py-1 text-xs font-medium text-warning ring-1 ring-inset ring-warning/20">
                            <AlertCircle className="size-3" /> Verification: review needed
                          </span>
                        )
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-2 py-1 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border">
                          <Clock className="size-3" /> Verification not run
                        </span>
                      )}
                      <Link
                        href={`/dashboard/evidence/${fileId}`}
                        className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-2 py-1 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border hover:text-foreground transition-colors"
                      >
                        <FileSearch className="size-3" /> View Evidence
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── VERIFICATION TAB ──────────────────────────────────────────────── */}
      {activeTab === 'verification' && (
        <div className="animate-in fade-in duration-300 slide-in-from-bottom-2">
          {verificationLoading ? (
            <div className="flex items-center justify-center p-14">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : verificationError && verificationRecords === null ? (
            <div className="rounded-xl border border-border bg-surface p-10 text-center flex flex-col items-center gap-3">
              <AlertCircle className="size-8 text-danger" />
              <p className="text-sm text-danger">{verificationError}</p>
            </div>
          ) : verificationRecords === null ? (
            <div className="flex items-center justify-center p-14">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : verificationRecords.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface p-14 text-center flex flex-col items-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-muted border border-border mb-4">
                <ShieldCheck className="size-7 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-2">Verification not yet run</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-7 leading-relaxed">
                Run the verification engine to independently recalculate each metric from the underlying fact records and confirm data integrity.
              </p>
              <button
                onClick={handleRunVerification}
                disabled={verificationRunning || hasZeroFacts}
                className={buttonVariants({ variant: 'default' })}
              >
                {verificationRunning ? (
                  <><Loader2 className="size-4 mr-2 animate-spin" />Running Verification…</>
                ) : (
                  'Run Verification'
                )}
              </button>
              {hasZeroFacts && (
                <p className="mt-3 text-xs text-muted-foreground">Verification requires extracted financial facts.</p>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Summary header */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {verificationRecords.length} metric{verificationRecords.length !== 1 ? 's' : ''} verified
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Last run {new Date(verificationRecords[verificationRecords.length - 1].created_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={handleRunVerification}
                  disabled={verificationRunning}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  {verificationRunning ? (
                    <><Loader2 className="size-3.5 mr-2 animate-spin" />Running…</>
                  ) : (
                    'Re-run'
                  )}
                </button>
              </div>

              {verificationError && (
                <div className="rounded-md bg-danger/10 border border-danger/20 px-4 py-3 text-sm text-danger">
                  {verificationError}
                </div>
              )}

              {/* Explainer — what verification means */}
              <div className="rounded-lg bg-surface-muted border border-border px-4 py-3">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">Independent verification:</span>
                  {' '}The verification engine re-sums all extracted fact records independently of the analytics engine
                  and compares the result. A VERIFIED status means both systems agree exactly.
                  NEEDS REVIEW means a discrepancy was detected.
                </p>
              </div>

              {/* Verification table */}
              <div className="rounded-xl border border-border bg-surface overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-surface-muted text-muted-foreground uppercase tracking-wider text-xs font-semibold border-b border-border">
                      <tr>
                        <th className="px-6 py-3">Metric</th>
                        <th className="px-6 py-3 text-right">Claimed</th>
                        <th className="px-6 py-3 text-right">Verified</th>
                        <th className="px-6 py-3 text-right">Facts</th>
                        <th className="px-6 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-surface">
                      {verificationRecords.map((rec) => {
                        const diff = rec.status === 'NEEDS_REVIEW'
                          ? Math.abs(rec.claimed_value - rec.verified_value)
                          : null
                        const isMargin = rec.metric === 'operating_margin'
                        return (
                          <tr key={rec.id} className="hover:bg-surface-muted/40 transition-colors">
                            <td className="px-6 py-4 font-medium text-foreground capitalize">
                              {rec.metric.replace(/_/g, ' ')}
                            </td>
                            <td className="px-6 py-4 text-right tabular-nums text-muted-foreground">
                              {isMargin ? `${rec.claimed_value.toFixed(2)}%` : formatCurrency(rec.claimed_value)}
                            </td>
                            <td className="px-6 py-4 text-right tabular-nums text-muted-foreground">
                              {isMargin ? `${rec.verified_value.toFixed(2)}%` : formatCurrency(rec.verified_value)}
                            </td>
                            <td className="px-6 py-4 text-right tabular-nums text-muted-foreground">
                              {rec.fact_count}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-1">
                                <VerificationStatusBadge status={rec.status} />
                                {diff !== null && (
                                  <span className="text-xs text-warning">
                                    Δ {isMargin ? `${diff.toFixed(2)}%` : formatCurrency(diff)}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end">
                <Link href={`/dashboard/evidence/${fileId}`} className="text-xs font-medium text-primary hover:underline flex items-center gap-1">
                  <FileSearch className="size-3" /> Inspect fact-level evidence
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
