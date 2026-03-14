import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'

export const useUserStore = defineStore('user', () => {
  const profileData = ref(null)
  const stats = ref(null)
  const loading = ref(false)
  const error = ref(null)

  async function fetchProfile(userId) {
    loading.value = true
    error.value = null

    try {
      const response = await axios.get(`/api/v1/users/${userId}`)

      if (response.data.success) {
        profileData.value = response.data.data
        // Set stats from profile data (they're included in the profile response)
        stats.value = {
          level: response.data.data.level,
          experience: response.data.data.experience,
          totalExperience: response.data.data.total_experience,
          currency: response.data.data.currency,
          gems: response.data.data.gems,
          questsCompleted: response.data.data.quests_completed,
          bossesDefeated: response.data.data.bosses_defeated
        }
        return true
      } else {
        error.value = response.data.error || 'Failed to fetch profile'
        return false
      }
    } catch (err) {
      console.error('Error fetching profile:', err)
      error.value = err.response?.data?.error || 'Failed to fetch profile'
      return false
    } finally {
      loading.value = false
    }
  }

  async function updateProfile(userId, updates) {
    loading.value = true
    error.value = null

    try {
      const response = await axios.patch(`/api/v1/users/${userId}`, updates)

      if (response.data.success) {
        profileData.value = { ...profileData.value, ...updates }
        return true
      } else {
        error.value = response.data.error || 'Failed to update profile'
        return false
      }
    } catch (err) {
      console.error('Error updating profile:', err)
      error.value = err.response?.data?.error || 'Failed to update profile'
      return false
    } finally {
      loading.value = false
    }
  }

  function calculateLevelProgress(experience, level) {
    const requiredExp = Math.floor(100 * Math.pow(1.5, level - 1))
    const percentage = (experience / requiredExp) * 100
    return {
      current: experience,
      required: requiredExp,
      percentage: Math.min(percentage, 100)
    }
  }

  return {
    profileData,
    stats,
    loading,
    error,
    fetchProfile,
    updateProfile,
    calculateLevelProgress
  }
})
