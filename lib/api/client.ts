import type {
  ApiErrorBody,
  BulkDeleteResultDto,
  BulkMoveResultDto,
  BulkSelectionDto,
  BulkSendResultDto,
  ChatSessionDto,
  DownloadUrlDto,
  FileDto,
  FolderDto,
  FolderListingDto,
  FolderTreeNodeDto,
  SearchResultDto,
  SessionDto,
  TelegramUploadSessionDto,
} from "@/lib/types";

export class ClientApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

async function parseError(res: Response): Promise<ClientApiError> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    return new ClientApiError(res.status, body.error?.code ?? "UNKNOWN", body.error?.message ?? res.statusText, body.error?.details);
  } catch {
    return new ClientApiError(res.status, "UNKNOWN", res.statusText || "Request failed");
  }
}

export interface UploadHandle {
  promise: Promise<FileDto>;
  abort: () => void;
}

/** Typed API client. The token binds every call to one Telegram user + one chat. */
export class ApiClient {
  /** Invoked for every failed request (used to re-authenticate on expired sessions). */
  onError?: (err: ClientApiError) => void;

  constructor(private token: string | null) {}

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, cache: "no-store" });
    if (!res.ok) {
      const err = await parseError(res);
      this.onError?.(err);
      throw err;
    }
    return (await res.json()) as T;
  }

  // auth
  createSession(initData: string, chatId?: string) {
    return this.request<SessionDto>("POST", "/api/auth/session", { initData, chatId });
  }
  selectChat(chatId: string) {
    return this.request<ChatSessionDto>("POST", "/api/auth/select-chat", { chatId });
  }

  // folders
  getFolder(folderId: string | null) {
    return this.request<FolderListingDto>("GET", `/api/folders/${folderId ?? "root"}`);
  }
  getTree() {
    return this.request<{ tree: FolderTreeNodeDto[] }>("GET", "/api/folders/tree");
  }
  createFolder(parentId: string | null, name: string) {
    return this.request<{ folder: FolderDto }>("POST", "/api/folders", { parentId, name });
  }
  renameFolder(folderId: string, name: string) {
    return this.request<{ folder: FolderDto }>("PATCH", `/api/folders/${folderId}`, { name });
  }
  deleteFolder(folderId: string) {
    return this.request<{ ok: true }>("DELETE", `/api/folders/${folderId}`);
  }
  moveFolder(folderId: string, parentId: string | null) {
    return this.request<{ folder: FolderDto }>("POST", `/api/folders/${folderId}/move`, { parentId });
  }

  // files
  getFile(fileId: string) {
    return this.request<{ file: FileDto }>("GET", `/api/files/${fileId}`);
  }
  renameFile(fileId: string, fileName: string) {
    return this.request<{ file: FileDto }>("PATCH", `/api/files/${fileId}`, { fileName });
  }
  deleteFile(fileId: string) {
    return this.request<{ ok: true }>("DELETE", `/api/files/${fileId}`);
  }
  moveFile(fileId: string, folderId: string | null) {
    return this.request<{ file: FileDto }>("POST", `/api/files/${fileId}/move`, { folderId });
  }
  getDownloadUrl(fileId: string) {
    return this.request<DownloadUrlDto>("POST", `/api/files/${fileId}/download-url`);
  }
  sendToTelegram(fileId: string) {
    return this.request<{ ok: true }>("POST", `/api/files/${fileId}/send`);
  }
  // bulk
  bulkDelete(selection: BulkSelectionDto) {
    return this.request<BulkDeleteResultDto>("POST", "/api/bulk/delete", selection);
  }
  bulkMove(selection: BulkSelectionDto, destinationId: string | null) {
    return this.request<BulkMoveResultDto>("POST", "/api/bulk/move", { ...selection, destinationId });
  }
  bulkSend(fileIds: string[]) {
    return this.request<BulkSendResultDto>("POST", "/api/bulk/send", { fileIds });
  }

  search(q: string) {
    return this.request<SearchResultDto>("GET", `/api/search?q=${encodeURIComponent(q)}`);
  }
  createTelegramUpload(folderId: string | null) {
    return this.request<TelegramUploadSessionDto>("POST", "/api/uploads/telegram", { folderId });
  }

  /** Browser upload with progress (XMLHttpRequest, since fetch has no upload progress). */
  upload(file: File, folderId: string | null, onProgress: (fraction: number) => void): UploadHandle {
    const xhr = new XMLHttpRequest();
    const promise = new Promise<FileDto>((resolve, reject) => {
      const form = new FormData();
      form.append("file", file, file.name);
      if (folderId) form.append("folderId", folderId);
      xhr.open("POST", "/api/files/upload");
      if (this.token) xhr.setRequestHeader("authorization", `Bearer ${this.token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve((JSON.parse(xhr.responseText) as { file: FileDto }).file);
          } catch {
            reject(new ClientApiError(xhr.status, "UNKNOWN", "Invalid server response"));
          }
        } else {
          try {
            const body = JSON.parse(xhr.responseText) as ApiErrorBody;
            reject(new ClientApiError(xhr.status, body.error?.code ?? "UNKNOWN", body.error?.message ?? "Upload failed", body.error?.details));
          } catch {
            reject(new ClientApiError(xhr.status, "UNKNOWN", xhr.status === 413 ? "File is too large." : "Upload failed"));
          }
        }
      };
      xhr.onerror = () => reject(new ClientApiError(0, "NETWORK", "Network error during upload"));
      xhr.onabort = () => reject(new ClientApiError(0, "ABORTED", "Upload cancelled"));
      xhr.send(form);
    });
    return { promise, abort: () => xhr.abort() };
  }
}

/** URL for inline previews/thumbnails; `token` is the chat-scoped media token from the session. */
export function mediaUrl(fileId: string, token: string, variant: "thumbnail" | "inline") {
  return variant === "thumbnail"
    ? `/api/files/${fileId}/thumbnail?t=${encodeURIComponent(token)}`
    : `/api/files/${fileId}/download?disposition=inline&t=${encodeURIComponent(token)}`;
}
