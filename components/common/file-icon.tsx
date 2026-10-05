"use client";

import {
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  FileVideo,
  Folder,
  Presentation,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fileCategory, type FileCategory } from "@/lib/utils/format";
import type { FileDto } from "@/lib/types";

const STYLES: Record<FileCategory, { Icon: typeof File; className: string }> = {
  image: { Icon: FileImage, className: "bg-pink-500/15 text-pink-600 dark:text-pink-400" },
  video: { Icon: FileVideo, className: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  audio: { Icon: FileAudio, className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  pdf: { Icon: FileType2, className: "bg-red-500/15 text-red-600 dark:text-red-400" },
  document: { Icon: FileText, className: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  spreadsheet: { Icon: FileSpreadsheet, className: "bg-green-500/15 text-green-600 dark:text-green-400" },
  presentation: { Icon: Presentation, className: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  archive: { Icon: FileArchive, className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" },
  code: { Icon: FileCode2, className: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
  text: { Icon: FileText, className: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
  other: { Icon: File, className: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
};

export function FileIcon({ file, className, size = "md" }: { file: Pick<FileDto, "fileName" | "mimeType" | "telegramKind">; className?: string; size?: "md" | "lg" }) {
  const { Icon, className: colors } = STYLES[fileCategory(file)];
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-lg", size === "lg" ? "size-16 rounded-2xl" : "size-10", colors, className)}>
      <Icon className={size === "lg" ? "size-8" : "size-5"} />
    </div>
  );
}

export function FolderIcon({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary", size === "lg" ? "size-16 rounded-2xl" : "size-10", className)}>
      <Folder className={cn(size === "lg" ? "size-8" : "size-5", "fill-current/20")} />
    </div>
  );
}
