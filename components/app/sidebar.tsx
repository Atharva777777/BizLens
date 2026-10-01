'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Folder,
  LogOut,
  BarChart2,
  FileSearch,
  ShieldCheck,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface AppSidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function AppSidebar({ mobileOpen, onMobileClose }: AppSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string | undefined>('')

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUserEmail(user?.email)
    }
    getUser()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navItems = [
    { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Files', href: '/dashboard/files', icon: Folder },
    { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart2 },
    { name: 'Evidence', href: '/dashboard/evidence', icon: FileSearch },
  ]

  const isNavActive = (href: string): boolean => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  // Get user initials for avatar
  const initials = userEmail
    ? userEmail.charAt(0).toUpperCase()
    : '?'

  const SidebarContent = (
    <div className="flex h-full flex-col bg-surface border-r border-border">
      {/* Logo */}
      <div className="flex h-14 items-center px-5 border-b border-border">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-foreground"
          onClick={onMobileClose}
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background">
            <ShieldCheck className="size-4" aria-hidden="true" />
          </div>
          BizLens
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p className="px-3 mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          Workspace
        </p>
        {navItems.map((item) => {
          const active = isNavActive(item.href)
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onMobileClose}
              className={cn(
                'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150',
                active
                  ? 'bg-foreground/[0.08] text-foreground'
                  : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
              )}
            >
              <item.icon
                className={cn(
                  'size-4 shrink-0 transition-colors',
                  active
                    ? 'text-foreground'
                    : 'text-muted-foreground/70 group-hover:text-foreground/70',
                )}
                aria-hidden="true"
              />
              {item.name}
              {active && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-md px-2 py-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-muted border border-border text-xs font-semibold text-foreground">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-xs font-medium text-foreground">
              {userEmail || 'Loading...'}
            </p>
            <p className="text-[10px] text-muted-foreground">Authenticated</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="mt-1 flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground text-left"
        >
          <LogOut className="size-4 shrink-0" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-60 lg:flex-col">
        {SidebarContent}
      </div>

      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm"
            onClick={onMobileClose}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 z-40 w-60 bg-surface shadow-xl flex flex-col">
            {SidebarContent}
          </div>
        </div>
      )}
    </>
  )
}
