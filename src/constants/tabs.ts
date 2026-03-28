import GroupSchedule from '@/features/GroupSchedule.vue'
import McServers from '@/features/McServers.vue'
import OfficialFeed from '@/features/OfficialFeed.vue'
import PastActivities from '@/features/PastActivities.vue'
import CampusExplorer from '@/features/CampusExplorer.vue'

export const tabs = [
  {
    key: 'schedule',
    label: '主要活动',
    component: GroupSchedule,
  },
  {
    key: 'history',
    label: '往期活动',
    component: PastActivities,
  },
  {
    key: 'latest',
    label: '最新动态',
    component: OfficialFeed,
  },
  {
    key: 'servers',
    label: '服务器列表',
    component: McServers,
  },
  {
    key: 'explore',
    label: '校园游览',
    component: CampusExplorer,
  },
  // 新增 tab 只需再 push 一行
] as const

// 类型自动推导
export type TabKey = (typeof tabs)[number]['key']
