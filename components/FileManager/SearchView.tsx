"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { CenterMessage, LoadingList } from "@/components/common/states";
import type { ItemAction } from "@/components/ContextMenu/ItemMenu";
import { FileRow } from "@/components/FileList/FileRow";
import { FolderRow } from "@/components/FolderList/FolderRow";
import type { FileDto, FolderDto } from "@/lib/types";
import { useSearch, type Item } from "./hooks";
import { useChatSession } from "./session-context";

interface Props {
  query: string;
  onOpenFolder: (folder: FolderDto) => void;
  onOpenFile: (file: FileDto) => void;
  onAction: (action: ItemAction, item: Item) => void;
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function SearchView({ query, onOpenFolder, onOpenFile, onAction }: Props) {
  const session = useChatSession();
  const debounced = useDebounced(query.trim(), 250);
  const results = useSearch(debounced);

  if (!debounced) {
    return <CenterMessage icon={<Search className="size-12" strokeWidth={1.25} />} title="Search this group's files" description="Type a file or folder name." />;
  }
  if (results.isLoading && !results.data) return <LoadingList />;
  if (results.error) return <CenterMessage title="Search failed" description={(results.error as Error).message} />;
  const data = results.data;
  if (!data || (data.folders.length === 0 && data.files.length === 0)) {
    return <CenterMessage title="No results" description={`Nothing matches “${debounced}”.`} />;
  }
  return (
    <div className="pb-24">
      {data.folders.length > 0 && (
        <section>
          <h2 className="px-4 pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Folders</h2>
          <div className="divide-y bg-card">
            {data.folders.map((f) => (
              <FolderRow key={f.id} folder={f} path={f.path} onOpen={onOpenFolder} onAction={onAction} />
            ))}
          </div>
        </section>
      )}
      {data.files.length > 0 && (
        <section>
          <h2 className="px-4 pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Files</h2>
          <div className="divide-y bg-card">
            {data.files.map((f) => (
              <FileRow key={f.id} file={f} path={f.path} mediaToken={session.mediaToken} onOpen={onOpenFile} onAction={onAction} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
