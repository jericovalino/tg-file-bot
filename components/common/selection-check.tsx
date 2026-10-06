import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Round check indicator shown at the start of a row in selection mode. Purely visual; the row handles the tap. */
export function SelectionCheck({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
        checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 bg-transparent",
        className,
      )}
    >
      {checked && <Check className="size-3.5" strokeWidth={3} />}
    </span>
  );
}
