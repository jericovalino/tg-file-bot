"use client";

import { AlertTriangle, FolderOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Placeholder for a FolderRow / FileRow. Mirrors the real row's box model (40px icon, 20px title line,
 * 16px meta line, 8px vertical padding) so swapping in real rows causes no height shift.
 */
function RowSkeleton({ wide }: { wide: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <Skeleton className="size-10 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <div className="flex h-5 items-center">
          <Skeleton className={cn("h-3.5", wide ? "w-3/4" : "w-1/2")} />
        </div>
        <div className="flex h-4 items-center">
          <Skeleton className={cn("h-2.5", wide ? "w-2/5" : "w-1/3")} />
        </div>
      </div>
    </div>
  );
}

/** Skeleton for the folder listing and search results. Matches the `mt-2 divide-y bg-card` section the real list uses. */
export function LoadingList({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("mt-2 divide-y bg-card", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <RowSkeleton key={i} wide={i % 3 !== 1} />
      ))}
    </div>
  );
}

/** Skeleton for the centered title / subtitle block in the Header. */
export function HeaderTitleSkeleton() {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center">
      <div className="flex h-[17px] items-center">
        <Skeleton className="h-3.5 w-32" />
      </div>
      <div className="flex h-4 items-center">
        <Skeleton className="h-2.5 w-20" />
      </div>
    </div>
  );
}

/** Skeleton for the breadcrumb strip under the header (same height as `Breadcrumbs`). */
export function BreadcrumbsSkeleton() {
  return (
    <div className="flex items-center gap-2 px-4 pb-2" aria-hidden="true">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-3 w-3 rounded-full" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

/** Skeleton for the folder tree in the move dialog: indented rows matching the tree node layout. */
export function LoadingTree({ rows = 5 }: { rows?: number }) {
  const depths = [1, 2, 2, 1, 2, 1, 2, 3];
  return (
    <div aria-busy="true" aria-label="Loading folders">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-1 pr-2" style={{ paddingLeft: `${depths[i % depths.length] * 16}px` }}>
          <span className="size-8 shrink-0" />
          <div className="flex flex-1 items-center gap-2 py-2">
            <Skeleton className="size-4 shrink-0 rounded" />
            <Skeleton className="h-3.5" style={{ width: `${40 + ((i * 23) % 35)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Whole-screen skeleton shown while the Telegram session is being established, shaped like the file browser. */
export function LoadingBrowser() {
  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top,0px)]" aria-busy="true" aria-label="Loading">
      <header className="sticky top-0 z-30 border-b bg-background">
        <div className="flex h-12 items-center gap-1 px-2">
          <div className="size-8" />
          <HeaderTitleSkeleton />
          <div className="size-8" />
          <div className="flex size-8 items-center justify-center">
            <Skeleton className="size-5 rounded-full" />
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col">
        <LoadingList />
      </main>
    </div>
  );
}

export function CenterMessage({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
      {icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <div className="mt-1.5 max-w-xs text-sm text-muted-foreground">{description}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function EmptyFolder({ canUpload, onUpload }: { canUpload: boolean; onUpload: () => void }) {
  return (
    <CenterMessage
      icon={<FolderOpen className="size-12" strokeWidth={1.25} />}
      title="This folder is empty"
      description={canUpload ? "Upload files or create a folder to get started." : "Nothing here yet."}
      action={canUpload ? <Button onClick={onUpload}>Upload files</Button> : undefined}
    />
  );
}

export function ErrorMessage({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <CenterMessage
      icon={<AlertTriangle className="size-12" strokeWidth={1.25} />}
      title="Something went wrong"
      description={error.message}
      action={onRetry ? <Button variant="outline" onClick={onRetry}>Try again</Button> : undefined}
    />
  );
}

export function FullScreenSpinner({ label }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}
