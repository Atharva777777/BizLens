'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Loader2,
  ArrowRight,
  Database,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  Upload,
  BarChart2,
  ShieldCheck,
  FileSearch,
} from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { apiFiles } from '@/lib/api/files'
import { apiAnalytics } from '@/lib/api/analytics'
import { FileRecord } from '@/lib/types/file'
import { FileMetrics, VerificationRecord } from '@/lib/types/analytics'

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

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function VerificationSummary({ records }: { records: VerificationRecord[] }) {
  if (records.length === 0) return null
  const verified = records.filter(r => r.status === 'VERIFIED').length
  const needsReview = records.filter(r => r.status === 'NEEDS_REVIEW').length
  const unable = records.filter(r => r.status === 'UNABLE_TO_VERIFY').length
  if (needsReview > 0 || unable > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
        <AlertCircle className="size-3" /> {needsReview + unable} need{needsReview + unable !== 1 ? '' : 's'} attention
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
      <ShieldCheck className="size-3" /> {verified} metric{verified !== 1 ? 's' : ''} verified
    </span>
  )
}

export default function DashboardPage() {
  const [files, setFiles] = useState<FileRecord[]>([])
  const [latestMetrics, setLatestMetrics] = useState<FileMetrics | null>(null)
  const [latestVerification, setLatestVerification] = useState<VerificationRecord[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [isMetricsLoading, setIsMetricsLoading] = useState(false)
  const [metricsError, setMetricsError] = useState(false)

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const records = await apiFiles.listFiles()
        const sorted = records.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        setFiles(sorted)

        const completed = sorted.filter(f => f.status === 'COMPLETED')
        if (completed.length > 0) {
          setIsMetricsLoading(true)
          try {
            const [metrics, verification] = await Promise.all([
              apiAnalytics.getFileMetrics(completed[0].id),
              apiAnalytics.getVerificationRecords(completed[0].id).catch(() => null),
            ])
            setLatestMetrics(metrics)
            if (verification) setLatestVerification(verification)
          } catch (e) {
            console.error('Failed to fetch latest metrics', e)
            setMetricsError(true)
          } finally {
            setIsMetricsLoading(false)
          }
        }
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : 'Failed to fetch dashboard data')
        setFiles([])
      } finally {
        setIsLoading(false)
      }
    }
    loadDashboard()
  }, [])

  const completedFiles = files.filter(f => f.status === 'COMPLETED')
  const processingFiles = files.filter(f => f.status === 'PROCESSING' || f.status === 'PENDING')
  const failedFiles = files.filter(f => f.status === 'FAILED')
  const latestFile = completedFiles.length > 0 ? completedFiles[0] : null

  if (isLoading) {
    return (
      <div className="max-w-4xl animate-in fade-in duration-500">
        <div className="mb-8">
          <div className="h-7 w-48 bg-surface-muted rounded animate-pulse mb-2" />
          <div className="h-4 w-72 bg-surface-muted rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4 mb-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-xl border border-border bg-surface p-5 h-24 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="max-w-4xl animate-in fade-in duration-500">
        {/* Header */}
        <div className="mb-10">
          <p className="text-sm text-muted-foreground mb-1">{getGreeting()}</p>
          <h2 className="text-2xl font-serif tracking-tight text-foreground">Your intelligence workspace is ready.</h2>
        </div>

        {/* Empty state */}
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="p-14 text-center flex flex-col items-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-muted border border-border mb-5">
              <Database className="size-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">No datasets yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-8 leading-relaxed">
              Upload your first dataset to begin. BizLens will extract facts, compute metrics, generate insights, and let you run independent verification.
            </p>
            <Link href="/dashboard/files" className={buttonVariants({ variant: 'default' })}>
              <Upload className="size-4 mr-2" />
              Upload Dataset
            </Link>
          </div>

          {/* Workflow pipeline */}
          <div className="border-t border-border bg-surface-muted/40 px-8 py-4">
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] font-medium text-muted-foreground uppercase tracking-widest">
              <span className="flex items-center gap-1.5"><Upload className="size-3" /> Upload</span>
              <ArrowRight className="size-3 opacity-40" />
              <span className="flex items-center gap-1.5"><BarChart2 className="size-3" /> Analyze</span>
              <ArrowRight className="size-3 opacity-40" />
              <span className="flex items-center gap-1.5"><ShieldCheck className="size-3" /> Verify</span>
              <ArrowRight className="size-3 opacity-40" />
              <span className="flex items-center gap-1.5"><FileSearch className="size-3" /> Evidence</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl animate-in fade-in duration-500 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground mb-0.5">{getGreeting()}</p>
          <h2 className="text-2xl font-serif tracking-tight text-foreground">Intelligence Workspace</h2>
        </div>
        <Link href="/dashboard/files" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          <Upload className="size-3.5 mr-2" />
          Upload Dataset
        </Link>
      </div>

      {fetchError && (
        <div className="flex items-center gap-2 rounded-md bg-danger/10 p-3 text-sm text-danger border border-danger/20">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {fetchError}
        </div>
      )}

      {/* Dataset status summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface p-4 hover:bg-surface-muted/50 transition-colors">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2.5">Total Datasets</div>
          <div className="text-3xl font-semibold text-foreground tabular-nums">{files.length}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 hover:bg-surface-muted/50 transition-colors">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2.5">Completed</div>
          <div className="text-3xl font-semibold text-success tabular-nums">{completedFiles.length}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 hover:bg-surface-muted/50 transition-colors">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2.5">Processing</div>
          <div className="text-3xl font-semibold tabular-nums">
            {processingFiles.length > 0 ? (
              <span className="text-primary flex items-center gap-1.5">
                {processingFiles.length} <Loader2 className="size-4 animate-spin" />
              </span>
            ) : (
              <span className="text-foreground">0</span>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 hover:bg-surface-muted/50 transition-colors">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2.5">Needs Attention</div>
          <div className={`text-3xl font-semibold tabular-nums ${failedFiles.length > 0 ? 'text-danger' : 'text-foreground'}`}>
            {failedFiles.length}
          </div>
        </div>
      </div>

      {/* Latest dataset metrics + status */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* KPI metrics */}
        <div className="md:col-span-2 rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Latest Dataset</h3>
              {latestFile && (
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">{latestFile.original_filename}</p>
              )}
            </div>
            {latestFile && latestMetrics && (
              <Link
                href={`/dashboard/analytics/${latestFile.id}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                View Analytics <ArrowRight className="size-3" />
              </Link>
            )}
          </div>

          <div className="p-5">
            {completedFiles.length === 0 ? (
              <div className="flex flex-col items-center py-6 text-center">
                <Database className="size-7 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No completed dataset yet</p>
              </div>
            ) : isMetricsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : metricsError || !latestMetrics ? (
              <div className="flex items-center gap-2 text-sm text-warning py-4">
                <AlertCircle className="size-4" />
                Could not load metrics. Refresh to retry.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-5">
                {/* Revenue */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    <TrendingUp className="size-3 text-success" /> Revenue
                  </div>
                  {latestMetrics.revenue_fact_count === 0 ? (
                    <div className="text-sm text-muted-foreground">Unavailable</div>
                  ) : (
                    <div className="text-2xl font-semibold text-foreground tabular-nums">{formatCurrency(latestMetrics.total_revenue)}</div>
                  )}
                  <div className="text-[11px] text-muted-foreground">{latestMetrics.revenue_fact_count} fact{latestMetrics.revenue_fact_count !== 1 ? 's' : ''}</div>
                </div>

                {/* Expense */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    <TrendingDown className="size-3 text-danger" /> Expense
                  </div>
                  {latestMetrics.expense_fact_count === 0 ? (
                    <div className="text-sm text-muted-foreground">Unavailable</div>
                  ) : (
                    <div className="text-2xl font-semibold text-foreground tabular-nums">{formatCurrency(latestMetrics.total_expense)}</div>
                  )}
                  <div className="text-[11px] text-muted-foreground">{latestMetrics.expense_fact_count} fact{latestMetrics.expense_fact_count !== 1 ? 's' : ''}</div>
                </div>

                {/* Net Profit */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    <DollarSign className="size-3 text-primary" /> Net Profit
                  </div>
                  {latestMetrics.revenue_fact_count === 0 && latestMetrics.expense_fact_count === 0 ? (
                    <div className="text-sm text-muted-foreground">Unavailable</div>
                  ) : (
                    <div className={`text-2xl font-semibold tabular-nums ${latestMetrics.net_profit < 0 ? 'text-danger' : 'text-foreground'}`}>
                      {formatCurrency(latestMetrics.net_profit)}
                    </div>
                  )}
                </div>

                {/* Margin */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    <Activity className="size-3 text-accent" /> Op. Margin
                  </div>
                  {latestMetrics.operating_margin === null ? (
                    <div className="text-sm text-muted-foreground">Unavailable</div>
                  ) : (
                    <div className="text-2xl font-semibold text-foreground tabular-nums">{formatPercent(latestMetrics.operating_margin)}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Data Health Panel */}
        <div className="rounded-xl border border-border bg-surface overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Data Health</h3>
          </div>
          <div className="p-5 flex-1 flex flex-col gap-3">
            {/* Analytics status */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Analytics</span>
              {completedFiles.length > 0 ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                  <CheckCircle2 className="size-3" /> Ready
                </span>
              ) : processingFiles.length > 0 ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  <Clock className="size-3" /> Processing
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">No data</span>
              )}
            </div>

            <div className="h-px bg-border" />

            {/* Evidence / facts */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Facts extracted</span>
              <span className="text-xs font-medium text-foreground tabular-nums">
                {latestMetrics
                  ? latestMetrics.revenue_fact_count + latestMetrics.expense_fact_count
                  : '—'}
              </span>
            </div>

            <div className="h-px bg-border" />

            {/* Verification status */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Verification</span>
              {latestVerification === null || latestVerification.length === 0 ? (
                <span className="text-xs text-muted-foreground">Not run</span>
              ) : (
                <VerificationSummary records={latestVerification} />
              )}
            </div>

            <div className="h-px bg-border" />

            {/* Failed datasets */}
            {failedFiles.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Failed</span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-danger">
                    <AlertCircle className="size-3" /> {failedFiles.length}
                  </span>
                </div>
                <div className="h-px bg-border" />
              </>
            )}

            {/* Action */}
            {latestFile && (
              <div className="mt-auto pt-2">
                <Link
                  href={`/dashboard/analytics/${latestFile.id}`}
                  className="flex items-center justify-between text-xs font-medium text-primary hover:underline"
                >
                  Open workspace
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent datasets */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Datasets</h3>
          <Link href="/dashboard/files" className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            Manage all →
          </Link>
        </div>
        <div className="divide-y divide-border">
          {files.slice(0, 5).map((file) => {
            const isCompleted = file.status === 'COMPLETED'
            const isProcessing = file.status === 'PROCESSING' || file.status === 'PENDING'
            const isFailed = file.status === 'FAILED'
            return (
              <div key={file.id} className="flex items-center justify-between px-5 py-3 hover:bg-surface-muted/40 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isCompleted ? 'bg-success' : isProcessing ? 'bg-primary animate-pulse' : isFailed ? 'bg-danger' : 'bg-muted-foreground'}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{file.original_filename}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(file.created_at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  {isCompleted ? (
                    <>
                      <span className="hidden sm:inline text-[11px] font-medium text-success uppercase tracking-wide">Completed</span>
                      <Link
                        href={`/dashboard/analytics/${file.id}`}
                        className="text-xs font-medium text-primary hover:underline whitespace-nowrap"
                      >
                        Analyze →
                      </Link>
                    </>
                  ) : isProcessing ? (
                    <span className="inline-flex items-center gap-1 text-xs text-primary">
                      <Loader2 className="size-3 animate-spin" /> Processing
                    </span>
                  ) : isFailed ? (
                    <span className="text-xs text-danger font-medium">Failed</span>
                  ) : (
                    <span className="text-xs text-muted-foreground capitalize">{file.status.toLowerCase()}</span>
                  )}
                </div>
              </div>
            )
          })}
          {files.length > 5 && (
            <div className="px-5 py-3 text-center">
              <Link href="/dashboard/files" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                View all {files.length} datasets →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Workflow pipeline hint */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">How BizLens Works</h3>
        </div>
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-start gap-6">
            {[
              { icon: Upload, label: 'Upload', desc: 'CSV dataset', href: '/dashboard/files' },
              { icon: BarChart2, label: 'Analyze', desc: 'Metrics & insights', href: latestFile ? `/dashboard/analytics/${latestFile.id}` : '/dashboard/analytics' },
              { icon: ShieldCheck, label: 'Verify', desc: 'Independent validation', href: latestFile ? `/dashboard/analytics/${latestFile.id}` : '/dashboard/analytics' },
              { icon: FileSearch, label: 'Evidence', desc: 'Fact provenance', href: latestFile ? `/dashboard/evidence/${latestFile.id}` : '/dashboard/evidence' },
            ].map((step, i, arr) => (
              <div key={step.label} className="flex items-center gap-4">
                <Link
                  href={step.href}
                  className="flex items-center gap-2 group"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-muted border border-border group-hover:border-foreground/20 transition-colors">
                    <step.icon className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">{step.label}</p>
                    <p className="text-[11px] text-muted-foreground">{step.desc}</p>
                  </div>
                </Link>
                {i < arr.length - 1 && (
                  <ArrowRight className="size-3.5 text-muted-foreground/40 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
