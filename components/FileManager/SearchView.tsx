"use client";

import { Search } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { CenterMessage, LoadingList } from "@/components/common/states";
import type { ItemAction } from "@/components/ContextMenu/ItemMenu";
import { FileRow } from "@/components/FileList/FileRow";
import { FolderRow } from "@/components/FolderList/FolderRow";
import type { FileDto, FolderDto, SearchResultDto } from "@/lib/types";
import type { Item } from "./hooks";
import type { Selection } from "./selection";
import { useChatSession } from "./session-context";

interface Props {
  /** Debounced, trimmed query the results belong to. */
  query: string;
  results: UseQueryResult<SearchResultDto>;
  onOpenFolder: (folder: FolderDto) => void;
  onOpenFile: (file: FileDto) => void;
  onAction: (action: ItemAction, item: Item) => void;
  selecting: boolean;
  selected: Selection;
  onToggleSelect: (item: Item) => void;
  onLongPress: (item: Item) => void;
}

export function SearchView({ query, results, onOpenFolder, onOpenFile, onAction, selecting, selected, onToggleSelect, onLongPress }: Props) {
  const session = useChatSession();

  if (!query) {
    return <CenterMessage icon={<Search className="size-12" strokeWidth={1.25} />} title="Search this group's files" description="Type a file or folder name." />;
  }
  if (results.isLoading && !results.data) return <LoadingList />;
  if (results.error) return <CenterMessage title="Search failed" description={(results.error as Error).message} />;
  const data = results.data;
  if (!data || (data.folders.length === 0 && data.files.length === 0)) {
    return <CenterMessage title="No results" description={`Nothing matches “${query}”.`} />;
  }
  const rowProps = { onAction, selecting, onToggleSelect, onLongPress };
  return (
    <div className={selecting ? "pb-20" : "pb-24"}>
      {data.folders.length > 0 && (
        <section>
          <h2 className="px-4 pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Folders</h2>
          <div className="divide-y bg-card">
            {data.folders.map((f) => (
              <FolderRow key={f.id} folder={f} path={f.path} onOpen={onOpenFolder} selected={selected.has(f.id)} {...rowProps} />
            ))}
          </div>
        </section>
      )}
      {data.files.length > 0 && (
        <section>
          <h2 className="px-4 pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Files</h2>
          <div className="divide-y bg-card">
            {data.files.map((f) => (
              <FileRow key={f.id} file={f} path={f.path} mediaToken={session.mediaToken} onOpen={onOpenFile} selected={selected.has(f.id)} {...rowProps} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
