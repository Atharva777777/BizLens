'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  FileSearch,
  BarChart2,
} from 'lucide-react'
import { apiAnalytics } from '@/lib/api/analytics'
import { apiFiles } from '@/lib/api/files'
import { NormalizedFact } from '@/lib/types/analytics'
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

function formatBytes(bytes: number): string {
  if (!+bytes) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

type FactWithType = NormalizedFact & { type: 'revenue' | 'expense' }
type FactFilter = 'all' | 'revenue' | 'expense'

export default function EvidenceFilePage() {
  const params = useParams()
  const fileId = params.file_id as string

  const [file, setFile] = useState<FileRecord | null>(null)
  const [facts, setFacts] = useState<FactWithType[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FactFilter>('all')

  useEffect(() => {
    if (!fileId) return
    const load = async () => {
      try {
        setIsLoading(true)
        const [fileData, revData, expData] = await Promise.all([
          apiFiles.getFile(fileId),
          apiAnalytics.getEvidenceFacts(fileId, 'revenue'),
          apiAnalytics.getEvidenceFacts(fileId, 'expense'),
        ])
        setFile(fileData)
        const combined: FactWithType[] = [
          ...revData.map((f) => ({ ...f, type: 'revenue' as const })),
          ...expData.map((f) => ({ ...f, type: 'expense' as const })),
        ].sort((a, b) => a.row_number - b.row_number)
        setFacts(combined)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load evidence.'
        setError(msg)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [fileId])

  const displayed = filter === 'all' ? facts : facts.filter((f) => f.type === filter)
  const revenueCount = facts.filter((f) => f.type === 'revenue').length
  const expenseCount = facts.filter((f) => f.type === 'expense').length

  // Totals for evidence summary
  const totalRevenueValue = facts.filter(f => f.type === 'revenue' && f.value_numeric !== null)
    .reduce((sum, f) => sum + (f.value_numeric ?? 0), 0)
  const totalExpenseValue = facts.filter(f => f.type === 'expense' && f.value_numeric !== null)
    .reduce((sum, f) => sum + (f.value_numeric ?? 0), 0)

  if (isLoading) {
    return (
      <div className="max-w-4xl animate-in fade-in duration-500">
        <div className="flex items-center gap-2 mb-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading evidence…
        </div>
        <div className="rounded-xl border border-border bg-surface p-6 h-64 animate-pulse" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-3xl">
        <Link
          href="/dashboard/evidence"
          className={buttonVariants({ variant: 'ghost', className: 'mb-6 -ml-4 text-muted-foreground' })}
        >
          <ArrowLeft className="mr-2 size-4" /> Back to Evidence
        </Link>
        <div className="rounded-xl border border-border bg-surface p-12 text-center flex flex-col items-center">
          <AlertCircle className="size-10 text-danger mb-4" />
          <h3 className="text-lg font-medium text-foreground">Failed to load evidence</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md">{error}</p>
          <div className="mt-8">
            <Link href="/dashboard/evidence" className={buttonVariants({ variant: 'default' })}>
              Return to Evidence
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl animate-in fade-in duration-500 space-y-5">

      {/* Header */}
      <div>
        <Link
          href="/dashboard/evidence"
          className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="mr-1.5 size-4" /> All datasets
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center flex-wrap gap-2.5">
              <h2 className="text-xl font-serif tracking-tight text-foreground">
                {file?.original_filename}
              </h2>
              <span className="inline-flex items-center rounded-md bg-success/10 px-2 py-1 text-[10px] font-semibold text-success ring-1 ring-inset ring-success/20 uppercase tracking-wider">
                {file?.status}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {file && formatBytes(file.file_size)} ·{' '}
              {file && new Date(file.created_at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
              {' · '}
              {facts.length} fact{facts.length !== 1 ? 's' : ''} extracted
            </p>
          </div>
          <Link
            href={`/dashboard/analytics/${fileId}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <BarChart2 className="size-4 mr-2" /> View Analytics
          </Link>
        </div>
      </div>

      {/* Provenance context banner */}
      {facts.length > 0 && (
        <div className="rounded-lg bg-surface-muted border border-border px-4 py-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">What you&apos;re seeing:</span>
            {' '}These are the individual financial fact records extracted from your dataset by the BizLens ingestion engine.
            Each row corresponds to a line in your source data. Aggregating all revenue facts gives the total revenue metric,
            and aggregating all expense facts gives the total expense metric — so the numbers here are the evidence behind every reported figure.
          </p>
        </div>
      )}

      {/* Summary cards */}
      {facts.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">Total Facts</div>
            <div className="text-2xl font-semibold text-foreground tabular-nums">{facts.length}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2 flex items-center gap-1">
              <TrendingUp className="size-3 text-success" /> Revenue
            </div>
            <div className="text-2xl font-semibold text-foreground tabular-nums">{revenueCount}</div>
            {revenueCount > 0 && (
              <div className="text-xs text-muted-foreground mt-1">{formatCurrency(totalRevenueValue)} sum</div>
            )}
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2 flex items-center gap-1">
              <TrendingDown className="size-3 text-danger" /> Expense
            </div>
            <div className="text-2xl font-semibold text-foreground tabular-nums">{expenseCount}</div>
            {expenseCount > 0 && (
              <div className="text-xs text-muted-foreground mt-1">{formatCurrency(totalExpenseValue)} sum</div>
            )}
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">Source</div>
            <div className="text-sm font-medium text-foreground truncate">{file?.original_filename}</div>
          </div>
        </div>
      )}

      {facts.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-14 text-center flex flex-col items-center">
          <FileSearch className="size-10 text-muted-foreground mb-4" />
          <h3 className="text-base font-medium text-foreground mb-2">No facts found</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            No recognizable financial facts were extracted from this dataset.
            Only datasets with detectable revenue or expense data will have evidence records.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Filter controls */}
          <div className="flex items-center gap-2">
            {(['all', 'revenue', 'expense'] as FactFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors border',
                  filter === f
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-surface text-muted-foreground border-border hover:bg-surface-muted hover:text-foreground',
                )}
              >
                {f === 'revenue' && <TrendingUp className="size-3 text-success" />}
                {f === 'expense' && <TrendingDown className="size-3 text-danger" />}
                <span className="capitalize">{f}</span>
                <span className="ml-1 tabular-nums opacity-60">
                  ({f === 'all' ? facts.length : f === 'revenue' ? revenueCount : expenseCount})
                </span>
              </button>
            ))}
            <span className="ml-auto text-xs text-muted-foreground">
              {displayed.length} of {facts.length} fact{facts.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Evidence table */}
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-surface-muted text-muted-foreground uppercase tracking-wider text-xs font-semibold border-b border-border">
                  <tr>
                    <th className="px-5 py-3">Source Row</th>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">Category</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3 text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {displayed.map((fact) => (
                    <tr key={fact.id} className="hover:bg-surface-muted/40 transition-colors">
                      <td className="px-5 py-3 text-muted-foreground tabular-nums text-xs">
                        Row {fact.row_number}
                      </td>
                      <td className="px-5 py-3">
                        {fact.type === 'revenue' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                            <TrendingUp className="size-3" /> Revenue
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-danger">
                            <TrendingDown className="size-3" /> Expense
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground text-sm">{fact.category || '—'}</td>
                      <td className="px-5 py-3 text-muted-foreground text-sm">{fact.date_value || '—'}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums text-sm">
                        {fact.value_numeric !== null ? formatCurrency(fact.value_numeric) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Summing all revenue facts = total revenue metric. Summing all expense facts = total expense metric.
            These facts are the source of truth for verification.
          </p>
        </div>
      )}
    </div>
  )
}
