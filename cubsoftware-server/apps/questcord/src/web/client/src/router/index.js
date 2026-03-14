import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes = [
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('../views/Dashboard.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/profile/:userId?',
    name: 'Profile',
    component: () => import('../views/Profile.vue')
  },
  {
    path: '/quests',
    name: 'Quests',
    component: () => import('../views/Quests.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/bosses',
    name: 'Bosses',
    component: () => import('../views/Bosses.vue')
  },
  {
    path: '/achievements',
    name: 'Achievements',
    component: () => import('../views/Achievements.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/guilds',
    name: 'Guilds',
    component: () => import('../views/Guilds.vue')
  },
  {
    path: '/daily',
    name: 'Daily',
    component: () => import('../views/Daily.vue')
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue')
  },
  {
    path: '/coming-soon',
    name: 'ComingSoon',
    component: () => import('../views/ComingSoon.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Navigation guard for authentication
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()

  // Allow access if there's a token in the URL (OAuth callback) or in localStorage
  const hasToken = to.query.token || authStore.token || localStorage.getItem('jwt_token')

  if (to.meta.requiresAuth && !authStore.isAuthenticated && !hasToken) {
    // Redirect to login with return URL
    next({ name: 'Login', query: { redirect: to.fullPath } })
  } else {
    next()
  }
})

export default router
