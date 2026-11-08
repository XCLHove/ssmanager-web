import { createRouter, createWebHistory } from 'vue-router'
import { clearAuth, getRole, getSessionKey, getToken, type Role } from '@/utils/auth'
import { resetPublicKeyCache } from '@/utils/crypto'
import { clearSessionUser, ensureMe } from '@/utils/session'

declare module 'vue-router' {
  interface RouteMeta {
    /** 无需登录即可访问的页面 */
    public?: boolean
    title?: string
    /** 允许访问的角色，未设置表示所有已登录用户 */
    roles?: Role[]
  }
}

function homeForRole(role: Role) {
  return { name: role === 'admin' ? 'servers' : 'my-servers' }
}

function storedHome() {
  return { name: getRole() === 'user' ? 'my-servers' : 'servers' }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true, title: '登录' },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { public: true, title: '注册账号' },
    },
    {
      path: '/',
      component: () => import('@/layouts/MainLayout.vue'),
      children: [
        { path: '', name: 'home', redirect: storedHome },
        {
          path: 'servers',
          name: 'servers',
          component: () => import('@/views/ServersView.vue'),
          meta: { title: '服务器管理', roles: ['admin'] },
        },
        {
          path: 'stats',
          name: 'stats',
          component: () => import('@/views/admin/TrafficView.vue'),
          meta: { title: '流量统计', roles: ['admin'] },
        },
        {
          path: 'users',
          name: 'users',
          component: () => import('@/views/admin/UsersView.vue'),
          meta: { title: '用户管理', roles: ['admin'] },
        },
        {
          path: 'codes',
          name: 'codes',
          component: () => import('@/views/admin/CodesView.vue'),
          meta: { title: '注册码管理', roles: ['admin'] },
        },
        {
          path: 'my-servers',
          name: 'my-servers',
          component: () => import('@/views/user/MyServersView.vue'),
          meta: { title: '我的服务器', roles: ['user'] },
        },
        {
          path: 'account',
          name: 'account',
          component: () => import('@/views/user/AccountView.vue'),
          meta: { title: '用户管理', roles: ['user'] },
        },
      ],
    },
    // 未匹配到的路径统一回主页（由 home 按角色重定向）
    { path: '/:pathMatch(.*)*', redirect: { name: 'home' } },
  ],
})

// 全局路由守卫：校验 token + 会话密钥 + 角色
router.beforeEach(async (to) => {
  const token = getToken()
  const sessionKey = getSessionKey()

  // 有 token 但缺会话密钥（无法加解密请求）按未登录处理
  if (token && !sessionKey) {
    clearAuth()
    clearSessionUser()
    resetPublicKeyCache()
  }

  const authenticated = !!token && !!sessionKey

  if (!to.meta.public && !authenticated) {
    return {
      name: 'login',
      query: to.fullPath === '/' ? {} : { redirect: to.fullPath },
    }
  }

  // 公开页面且未登录，直接放行
  if (!authenticated) return true

  const me = await ensureMe()
  if (!me) {
    clearAuth()
    clearSessionUser()
    resetPublicKeyCache()
    if (to.meta.public) return true
    return {
      name: 'login',
      query: to.fullPath === '/' ? {} : { redirect: to.fullPath },
    }
  }

  // 已登录访问登录/注册页 → 自己的首页
  if (to.meta.public) {
    return homeForRole(me.role)
  }

  // 无权限访问 → 自己的首页
  const roles = to.meta.roles
  if (roles && !roles.includes(me.role)) {
    return homeForRole(me.role)
  }

  return true
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} - ssmanager` : 'ssmanager 管理控制台'
})

export default router
