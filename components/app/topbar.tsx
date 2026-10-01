'use client'

import { Menu } from 'lucide-react'
import { usePathname } from 'next/navigation'

interface AppTopbarProps {
  onMenuClick: () => void
}

export function AppTopbar({ onMenuClick }: AppTopbarProps) {
  const pathname = usePathname()

  const getPageTitle = (): { title: string; sub?: string } => {
    if (pathname === '/dashboard') return { title: 'Overview', sub: 'Intelligence workspace' }
    if (pathname?.startsWith('/dashboard/analytics/')) {
      return { title: 'Analytics', sub: 'Dataset workspace' }
    }
    if (pathname === '/dashboard/analytics') return { title: 'Analytics', sub: 'Select a dataset' }
    if (pathname?.startsWith('/dashboard/files')) return { title: 'Files', sub: 'Datasets & uploads' }
    if (pathname?.startsWith('/dashboard/evidence/')) {
      return { title: 'Evidence', sub: 'Provenance workspace' }
    }
    if (pathname === '/dashboard/evidence') return { title: 'Evidence', sub: 'Select a dataset' }
    return { title: 'BizLens' }
  }

  const { title, sub } = getPageTitle()

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-x-4 border-b border-border bg-surface/95 backdrop-blur-sm px-4 sm:px-6 lg:px-8">
      <button
        type="button"
        className="-m-2.5 p-2.5 text-muted-foreground hover:text-foreground lg:hidden"
        onClick={onMenuClick}
        aria-label="Open sidebar"
      >
        <span className="sr-only">Open sidebar</span>
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Separator for mobile */}
      <div className="h-5 w-px bg-border lg:hidden" aria-hidden="true" />

      <div className="flex flex-1 items-center gap-3">
        <div>
          <h1 className="text-sm font-semibold tracking-tight text-foreground leading-none">{title}</h1>
          {sub && (
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-none">{sub}</p>
          )}
        </div>
      </div>
    </header>
  )
}
