/** DTOs shared between the API and the Mini App client. Keep this file free of server-only imports. */
import type { Permission, Role } from "@/lib/permissions/policy";

export type { Permission, Role };

export interface UserDto {
  id: string;
  telegramUserId: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
}

export interface ChatDto {
  id: string;
  chatKey: string;
  title: string;
  type: string;
  botStatus: string;
}

export interface FolderDto {
  id: string;
  parentId: string | null;
  name: string;
  createdAt: string;
  updatedAt: string;
  createdBy: UserSummary | null;
}

export interface UserSummary {
  id: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
}

export type TelegramKind = "document" | "photo" | "video" | "animation" | "audio" | "voice" | "video_note";

export interface FileDto {
  id: string;
  folderId: string | null;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  telegramKind: TelegramKind;
  hasThumbnail: boolean;
  width: number | null;
  height: number | null;
  duration: number | null;
  createdAt: string;
  updatedAt: string;
  createdBy: UserSummary | null;
  /** Whether the hosted Bot API can serve this file through the browser (size <= download limit). */
  browserDownloadable: boolean;
}

export interface BreadcrumbDto {
  id: string | null;
  name: string;
}

export interface FolderListingDto {
  folder: FolderDto | null;
  breadcrumbs: BreadcrumbDto[];
  folders: FolderDto[];
  files: FileDto[];
}

export interface FolderTreeNodeDto {
  id: string;
  name: string;
  parentId: string | null;
  children: FolderTreeNodeDto[];
}

export interface SearchResultDto {
  folders: (FolderDto & { path: BreadcrumbDto[] })[];
  files: (FileDto & { path: BreadcrumbDto[] })[];
}

export interface LimitsDto {
  maxUploadBytes: number;
  maxDownloadBytes: number;
  isLocalServer: boolean;
}

export interface StartTargetDto {
  folderId?: string | null;
  fileId?: string | null;
}

export interface ChatSessionDto {
  status: "chat";
  token: string;
  mediaToken: string;
  expiresAt: string;
  user: UserDto;
  chat: ChatDto;
  role: Role;
  permissions: Permission[];
  limits: LimitsDto;
  botUsername: string;
  /** Prefix for share links: append `file_<id>` or `folder_<id>`. */
  deepLinkBase: string;
  target: StartTargetDto;
}

export interface ChatChoiceDto {
  id: string;
  title: string;
  type: string;
  role: Role;
}

export interface SelectChatSessionDto {
  status: "select-chat";
  token: string;
  user: UserDto;
  chats: ChatChoiceDto[];
  botUsername: string;
}

export type SessionDto = ChatSessionDto | SelectChatSessionDto;

export interface DownloadUrlDto {
  url: string;
  expiresAt: string;
  browserDownloadable: boolean;
  fileName: string;
  mimeType: string | null;
}

export interface TelegramUploadSessionDto {
  sessionId: string;
  link: string;
  expiresAt: string;
  folderPath: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

// ─── Bulk operations ────────────────────────────────────────────────────────────

/** A set of items selected in the Mini App. Both lists may be empty but at least one id is required. */
export interface BulkSelectionDto {
  fileIds: string[];
  folderIds: string[];
}

export interface BulkDeleteResultDto {
  ok: true;
  /** Files removed directly plus files that lived inside removed folders. */
  removedFiles: number;
  /** Folders removed directly plus their descendants. */
  removedFolders: number;
}

export interface BulkMoveResultDto {
  ok: true;
  movedFiles: number;
  movedFolders: number;
}

export interface BulkSendFailureDto {
  fileId: string;
  fileName: string;
  code: string;
  message: string;
}

export interface BulkSendResultDto {
  ok: true;
  sent: number;
  failed: BulkSendFailureDto[];
}
