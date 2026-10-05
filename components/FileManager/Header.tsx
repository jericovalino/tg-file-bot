"use client";

import { ChevronLeft, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BreadcrumbDto } from "@/lib/types";
import { Breadcrumbs } from "./Breadcrumbs";

interface Props {
  title: string;
  subtitle?: string;
  breadcrumbs: BreadcrumbDto[];
  canGoBack: boolean;
  onBack: () => void;
  onNavigate: (folderId: string | null) => void;
  searchMode: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
}

export function Header(p: Props) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex h-12 items-center gap-1 px-2">
        {p.searchMode ? (
          <>
            <Button variant="ghost" size="icon" aria-label="Close search" onClick={p.onCloseSearch}>
              <ChevronLeft />
            </Button>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={p.searchQuery}
                onChange={(e) => p.onSearchChange(e.target.value)}
                placeholder="Search files and folders…"
                className="h-9 rounded-full bg-muted pl-8 pr-8"
                inputMode="search"
                enterKeyHint="search"
              />
              {p.searchQuery && (
                <button
                  type="button"
                  aria-label="Clear"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/30 p-0.5 text-background"
                  onClick={() => p.onSearchChange("")}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            {p.canGoBack ? (
              <Button variant="ghost" size="icon" aria-label="Back" onClick={p.onBack}>
                <ChevronLeft />
              </Button>
            ) : (
              <div className="size-8" />
            )}
            <div className="min-w-0 flex-1 text-center">
              <h1 className="truncate text-[15px] font-semibold leading-tight">{p.title}</h1>
              {p.subtitle && <p className="truncate text-xs text-muted-foreground">{p.subtitle}</p>}
            </div>
            <Button variant="ghost" size="icon" aria-label="Search" onClick={p.onOpenSearch}>
              <Search />
            </Button>
          </>
        )}
      </div>
      {!p.searchMode && p.breadcrumbs.length > 1 && <Breadcrumbs items={p.breadcrumbs} onNavigate={p.onNavigate} />}
    </header>
  );
}
