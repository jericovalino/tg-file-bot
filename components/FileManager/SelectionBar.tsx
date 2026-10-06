"use client";

import { FolderInput, Loader2, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Item } from "./hooks";
import { bulkCapabilities } from "./selection";
import { useSession } from "./session-context";

export type BulkAction = "move" | "send" | "delete";

interface Props {
  items: Item[];
  busy: BulkAction | null;
  onAction: (action: BulkAction) => void;
}

/** Bottom bar with the actions that apply to the whole selection. Replaces the floating "add" button while selecting. */
export function SelectionBar({ items, busy, onAction }: Props) {
  const { can } = useSession();
  const caps = bulkCapabilities(items, can);
  const disabled = (enabled: boolean) => !enabled || busy !== null;
  const actions: { key: BulkAction; label: string; icon: typeof Send; enabled: boolean; destructive?: boolean }[] = [
    { key: "move", label: "Move", icon: FolderInput, enabled: caps.move },
    { key: "send", label: "Send to me", icon: Send, enabled: caps.send },
    { key: "delete", label: "Delete", icon: Trash2, enabled: caps.delete, destructive: true },
  ];
  // Members without move/delete rights and no downloadable selection would see an all-disabled bar; that is still
  // informative ("nothing you can do with this"), so the bar always renders while selecting.
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex h-14 items-stretch justify-around px-2">
        {actions.map(({ key, label, icon: Icon, enabled, destructive }) => (
          <Button
            key={key}
            variant="ghost"
            disabled={disabled(enabled)}
            onClick={() => onAction(key)}
            className={`h-auto flex-1 flex-col gap-0.5 rounded-lg px-1 py-1 text-[11px] font-medium ${destructive ? "text-destructive hover:text-destructive" : ""}`}
          >
            {busy === key ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
