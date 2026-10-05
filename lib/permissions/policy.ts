/**
 * Role & permission policy. Roles are derived from Telegram chat membership but the mapping lives here so
 * custom roles (stored in chat_members.custom_role) can be introduced without touching the API handlers.
 */

export const ROLES = ["owner", "admin", "member", "restricted"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "files.view",
  "files.download",
  "files.upload",
  "files.rename",
  "files.move",
  "files.delete",
  /** Rename/delete only files the user uploaded themselves. */
  "files.rename.own",
  "files.delete.own",
  "folders.create",
  "folders.rename",
  "folders.move",
  "folders.delete",
  /** Reserved for future admin screens (custom roles, settings). */
  "chat.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MEMBER_PERMISSIONS: Permission[] = ["files.view", "files.download", "files.upload", "files.rename.own", "files.delete.own"];

const ADMIN_PERMISSIONS: Permission[] = [
  ...MEMBER_PERMISSIONS,
  "files.rename",
  "files.move",
  "files.delete",
  "folders.create",
  "folders.rename",
  "folders.move",
  "folders.delete",
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: [...ADMIN_PERMISSIONS, "chat.manage"],
  admin: ADMIN_PERMISSIONS,
  member: MEMBER_PERMISSIONS,
  // Restricted members (muted etc.) can still read, but not change anything.
  restricted: ["files.view", "files.download"],
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** Maps a Telegram ChatMember status to an application role. Returns null when the user is not a member. */
export function roleFromTelegramStatus(status: string, isMember?: boolean): Role | null {
  switch (status) {
    case "creator":
      return "owner";
    case "administrator":
      return "admin";
    case "member":
      return "member";
    case "restricted":
      return isMember === false ? null : "restricted";
    case "left":
    case "kicked":
    default:
      return null;
  }
}

export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function roleHas(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
