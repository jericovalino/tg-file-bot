"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "./session-context";
import type { FileDto, FolderDto } from "@/lib/types";

export function useChatId(): string {
  const { state } = useSession();
  return state.status === "ready" ? state.session.chat.id : "";
}

export const keys = {
  folder: (chatId: string, folderId: string | null) => ["folder", chatId, folderId ?? "root"] as const,
  tree: (chatId: string) => ["tree", chatId] as const,
  search: (chatId: string, q: string) => ["search", chatId, q] as const,
  file: (chatId: string, fileId: string) => ["file", chatId, fileId] as const,
};

export function useFolder(folderId: string | null, opts: { refetchInterval?: number | false } = {}) {
  const { api, state } = useSession();
  const chatId = useChatId();
  return useQuery({
    queryKey: keys.folder(chatId, folderId),
    queryFn: () => api.getFolder(folderId),
    enabled: state.status === "ready",
    refetchInterval: opts.refetchInterval ?? false,
  });
}

export function useFolderTree(enabled = true) {
  const { api, state } = useSession();
  const chatId = useChatId();
  return useQuery({
    queryKey: keys.tree(chatId),
    queryFn: async () => (await api.getTree()).tree,
    enabled: enabled && state.status === "ready",
  });
}

export function useSearch(q: string) {
  const { api, state } = useSession();
  const chatId = useChatId();
  return useQuery({
    queryKey: keys.search(chatId, q),
    queryFn: () => api.search(q),
    enabled: state.status === "ready" && q.trim().length > 0,
    placeholderData: (prev) => prev,
  });
}

export function useFile(fileId: string | null) {
  const { api, state } = useSession();
  const chatId = useChatId();
  return useQuery({
    queryKey: keys.file(chatId, fileId ?? ""),
    queryFn: async () => (await api.getFile(fileId!)).file,
    enabled: state.status === "ready" && !!fileId,
  });
}

/** Invalidates everything that may show folder/file names after a mutation. */
export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["folder"] });
    void qc.invalidateQueries({ queryKey: ["tree"] });
    void qc.invalidateQueries({ queryKey: ["search"] });
    void qc.invalidateQueries({ queryKey: ["file"] });
  };
}

export function useFolderMutations() {
  const { api } = useSession();
  const invalidate = useInvalidateAll();
  const create = useMutation({
    mutationFn: (v: { parentId: string | null; name: string }) => api.createFolder(v.parentId, v.name),
    onSuccess: invalidate,
  });
  const rename = useMutation({
    mutationFn: (v: { folderId: string; name: string }) => api.renameFolder(v.folderId, v.name),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (folderId: string) => api.deleteFolder(folderId), onSuccess: invalidate });
  const move = useMutation({
    mutationFn: (v: { folderId: string; parentId: string | null }) => api.moveFolder(v.folderId, v.parentId),
    onSuccess: invalidate,
  });
  return { create, rename, remove, move };
}

export function useFileMutations() {
  const { api } = useSession();
  const invalidate = useInvalidateAll();
  const rename = useMutation({
    mutationFn: (v: { fileId: string; fileName: string }) => api.renameFile(v.fileId, v.fileName),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (fileId: string) => api.deleteFile(fileId), onSuccess: invalidate });
  const move = useMutation({
    mutationFn: (v: { fileId: string; folderId: string | null }) => api.moveFile(v.fileId, v.folderId),
    onSuccess: invalidate,
  });
  return { rename, remove, move };
}

export type Item = { kind: "folder"; data: FolderDto } | { kind: "file"; data: FileDto };
