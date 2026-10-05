/** Minimal Telegram Bot API types used by this application (Bot API 10.x). */

export interface TgUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TgPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TgDocument {
  file_id: string;
  file_unique_id: string;
  thumbnail?: TgPhotoSize;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TgVideo extends TgDocument {
  width: number;
  height: number;
  duration: number;
}

export type TgAnimation = TgVideo;

export interface TgAudio extends TgDocument {
  duration: number;
  performer?: string;
  title?: string;
}

export interface TgVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TgVideoNote {
  file_id: string;
  file_unique_id: string;
  length: number;
  duration: number;
  thumbnail?: TgPhotoSize;
  file_size?: number;
}

export interface TgMessageEntity {
  type: string;
  offset: number;
  length: number;
}

export interface TgMessage {
  message_id: number;
  date: number;
  chat: TgChat;
  from?: TgUser;
  text?: string;
  caption?: string;
  entities?: TgMessageEntity[];
  document?: TgDocument;
  photo?: TgPhotoSize[];
  video?: TgVideo;
  animation?: TgAnimation;
  audio?: TgAudio;
  voice?: TgVoice;
  video_note?: TgVideoNote;
  media_group_id?: string;
  /** Present on ephemeral command messages (Bot API 10.2+). */
  ephemeral_message_id?: number;
  receiver_user?: TgUser;
  new_chat_members?: TgUser[];
  left_chat_member?: TgUser;
}

export type TgChatMemberStatus = "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";

export interface TgChatMember {
  status: TgChatMemberStatus;
  user: TgUser;
  is_anonymous?: boolean;
  can_delete_messages?: boolean;
  can_restrict_members?: boolean;
  can_manage_chat?: boolean;
  is_member?: boolean; // restricted
}

export interface TgChatMemberUpdated {
  chat: TgChat;
  from: TgUser;
  date: number;
  old_chat_member: TgChatMember;
  new_chat_member: TgChatMember;
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  chat_instance: string;
  data?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  channel_post?: TgMessage;
  callback_query?: TgCallbackQuery;
  my_chat_member?: TgChatMemberUpdated;
  chat_member?: TgChatMemberUpdated;
}

export interface TgFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

export interface TgWebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
  allowed_updates?: string[];
}

export interface TgInlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
  web_app?: { url: string };
}

export interface TgInlineKeyboardMarkup {
  inline_keyboard: TgInlineKeyboardButton[][];
}

export interface TgBotCommand {
  command: string;
  description: string;
  /** Bot API 10.2+: command visible only to the sender; the bot replies with an ephemeral message. */
  is_ephemeral?: boolean;
}

export type TgBotCommandScope =
  | { type: "default" }
  | { type: "all_private_chats" }
  | { type: "all_group_chats" }
  | { type: "all_chat_administrators" };

export type TgMenuButton = { type: "commands" } | { type: "default" } | { type: "web_app"; text: string; web_app: { url: string } };

export interface TgEphemeralMessageParameters {
  receiver_user_id: number;
  callback_query_id?: string;
  replace_callback_query_message?: boolean;
}

export interface TgResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { migrate_to_chat_id?: number; retry_after?: number };
}

/** A file attached to a message, normalised across Telegram media types. */
export interface ExtractedMedia {
  kind: "document" | "photo" | "video" | "animation" | "audio" | "voice" | "video_note";
  fileId: string;
  fileUniqueId: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  duration?: number;
  thumbnailFileId?: string;
}
