import { ApiError } from "@/lib/api/errors";
import { type Permission, type Role, roleHas } from "./policy";

export * from "./policy";

export interface Principal {
  userId: string;
  role: Role;
}

/**
 * Check a permission against a principal. When an `own` variant exists and the resource was created by the
 * principal, the own variant is accepted as well (e.g. a member deleting their own upload).
 */
export function can(principal: Principal, permission: Permission, resource?: { createdBy: string | null }): boolean {
  if (roleHas(principal.role, permission)) return true;
  if (resource && resource.createdBy === principal.userId) {
    const own = `${permission}.own` as Permission;
    if (roleHas(principal.role, own)) return true;
  }
  return false;
}

export function assertCan(principal: Principal, permission: Permission, resource?: { createdBy: string | null }): void {
  if (!can(principal, permission, resource)) {
    throw new ApiError(403, "FORBIDDEN", `You don't have permission to do this (${permission}).`);
  }
}
