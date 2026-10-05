CREATE TABLE "chat_members" (
	"chat_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"telegram_status" text NOT NULL,
	"role" text NOT NULL,
	"custom_role" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_members_chat_id_user_id_pk" PRIMARY KEY("chat_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"folder_id" uuid,
	"telegram_file_id" text NOT NULL,
	"telegram_file_unique_id" text NOT NULL,
	"telegram_kind" text DEFAULT 'document' NOT NULL,
	"thumbnail_file_id" text,
	"file_name" text NOT NULL,
	"mime_type" text,
	"file_size" bigint,
	"width" integer,
	"height" integer,
	"duration" integer,
	"storage_chat_id" bigint,
	"storage_message_id" bigint,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_chat_id" bigint NOT NULL,
	"chat_key" text NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"username" text,
	"chat_instance" text,
	"bot_status" text DEFAULT 'member' NOT NULL,
	"storage_chat_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"folder_id" uuid,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"files_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_user_id" bigint NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"username" text,
	"language_code" text,
	"photo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_chat_id_telegram_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."telegram_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_chat_id_telegram_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."telegram_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_chat_id_telegram_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."telegram_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_id_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_chat_id_telegram_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."telegram_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_members_user_id_idx" ON "chat_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "files_chat_folder_idx" ON "files" USING btree ("chat_id","folder_id");--> statement-breakpoint
CREATE INDEX "files_chat_file_name_idx" ON "files" USING btree ("chat_id","file_name");--> statement-breakpoint
CREATE INDEX "files_telegram_file_unique_id_idx" ON "files" USING btree ("telegram_file_unique_id");--> statement-breakpoint
CREATE INDEX "files_created_by_idx" ON "files" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "folders_chat_parent_idx" ON "folders" USING btree ("chat_id","parent_id");--> statement-breakpoint
CREATE INDEX "folders_chat_name_idx" ON "folders" USING btree ("chat_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "folders_chat_parent_name_uq" ON "folders" USING btree ("chat_id",coalesce("parent_id", '00000000-0000-0000-0000-000000000000'::uuid),lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_chats_telegram_chat_id_uq" ON "telegram_chats" USING btree ("telegram_chat_id");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_chats_chat_key_uq" ON "telegram_chats" USING btree ("chat_key");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_chats_chat_instance_uq" ON "telegram_chats" USING btree ("chat_instance");--> statement-breakpoint
CREATE INDEX "upload_sessions_user_status_idx" ON "upload_sessions" USING btree ("user_id","status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_telegram_user_id_uq" ON "users" USING btree ("telegram_user_id");