export const USER_PERMISSION = {
  USER: 0,
  ADMIN: 1,
  SUPER_ADMIN: 2,
} as const

export type UserPermission = (typeof USER_PERMISSION)[keyof typeof USER_PERMISSION]

export function canMaskAsUserPermission(permission: number) {
  return permission === USER_PERMISSION.ADMIN || permission === USER_PERMISSION.SUPER_ADMIN
}

export function isAdminPermission(permission: number) {
  return permission === USER_PERMISSION.ADMIN || permission === USER_PERMISSION.SUPER_ADMIN
}
