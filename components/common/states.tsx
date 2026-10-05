"use client";

import { AlertTriangle, FolderOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReactNode } from "react";

export function LoadingList() {
  return (
    <div className="divide-y">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="size-10 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
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
