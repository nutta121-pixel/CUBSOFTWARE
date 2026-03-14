import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const token = ref(localStorage.getItem('jwt_token') || null)
  const loading = ref(false)

  const isAuthenticated = computed(() => !!user.value)

  // Set axios default authorization header
  if (token.value) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token.value}`
  }

  async function checkAuth() {
    if (!token.value) {
      user.value = null
      return false
    }

    try {
      loading.value = true
      const response = await axios.get('/auth/me')

      if (response.data.success) {
        user.value = response.data.user
        return true
      } else {
        logout()
        return false
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      logout()
      return false
    } finally {
      loading.value = false
    }
  }

  function login(redirectUrl = '/dashboard') {
    // Redirect to Discord OAuth
    window.location.href = `/auth/discord/login?returnTo=${encodeURIComponent(redirectUrl)}`
  }

  function logout() {
    user.value = null
    token.value = null
    localStorage.removeItem('jwt_token')
    delete axios.defaults.headers.common['Authorization']
    window.location.href = '/'
  }

  function setToken(newToken) {
    token.value = newToken
    localStorage.setItem('jwt_token', newToken)
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
  }

  function setUser(newUser) {
    user.value = newUser
  }

  return {
    user,
    token,
    loading,
    isAuthenticated,
    checkAuth,
    login,
    logout,
    setToken,
    setUser
  }
})
