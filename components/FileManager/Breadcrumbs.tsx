"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";
import type { BreadcrumbDto } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Breadcrumbs({ items, onNavigate, className }: { items: BreadcrumbDto[]; onNavigate: (folderId: string | null) => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ left: ref.current.scrollWidth, behavior: "smooth" });
  }, [items]);
  return (
    <nav aria-label="Breadcrumb" ref={ref} className={cn("flex items-center gap-0.5 overflow-x-auto px-3 pb-2 text-[13px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <span key={c.id ?? "root"} className="flex shrink-0 items-center gap-0.5">
            {i > 0 && <ChevronRight className="size-3.5 text-muted-foreground/60" />}
            <button
              type="button"
              disabled={last}
              onClick={() => onNavigate(c.id)}
              className={cn("max-w-[40vw] truncate rounded px-1 py-0.5", last ? "font-medium text-foreground" : "text-[var(--link)]")}
            >
              {c.name}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
