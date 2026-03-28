import type { UserPermission } from '@/constants/userPermission'

export interface User {
  user_id: string
  username: string
  email: string
  login_time: string
  provider: string
  avatar_url?: string
  permission: UserPermission
}
