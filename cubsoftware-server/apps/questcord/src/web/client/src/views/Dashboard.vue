<template>
  <div class="min-h-screen flex flex-col">
    <!-- Hero Section -->
    <div class="hero">
      <div class="container">
        <div class="hero-title-container">
          <h1 class="hero-title">QuestCord</h1>
        </div>
        <p class="hero-subtitle">Quest across the Discord universe</p>
        <p class="hero-description">Complete quests, defeat bosses, and climb the global leaderboard in this immersive Discord RPG experience</p>
        <div class="hero-buttons">
          <router-link to="/quests" class="btn btn-primary">Quests</router-link>
          <router-link to="/bosses" class="btn btn-secondary">Bosses</router-link>
          <router-link to="/guilds" class="btn btn-secondary">Guilds</router-link>
          <router-link to="/profile" class="btn btn-secondary">Profile</router-link>
          <button v-if="authStore.isAuthenticated" @click="authStore.logout()" class="btn btn-secondary" style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); border: none;">Logout</button>
          <button v-else @click="authStore.login()" class="btn btn-secondary" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); border: none;">Login</button>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <main class="container mx-auto px-4 py-8 flex-1">
      <div v-if="loading" class="text-center py-12">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        <p class="mt-4 text-gray-400">Loading...</p>
      </div>

      <div v-else-if="user">
        <!-- Welcome Section -->
        <div class="mb-8">
          <h2 class="text-4xl font-bold mb-2">Welcome back, {{ user.username }}!</h2>
          <p class="text-gray-400">Ready for your next adventure?</p>
        </div>

        <!-- Stats Grid -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <!-- Level Card -->
          <div class="card">
            <div class="text-sm text-gray-400 mb-1">Level</div>
            <div class="text-3xl font-bold text-primary">{{ user.level }}</div>
          </div>

          <!-- Currency Card -->
          <div class="card">
            <div class="text-sm text-gray-400 mb-1">Dakari</div>
            <div class="text-3xl font-bold text-warning">{{ user.currency?.toLocaleString() || 0 }}</div>
          </div>

          <!-- Gems Card -->
          <div class="card">
            <div class="text-sm text-gray-400 mb-1">Gems</div>
            <div class="text-3xl font-bold text-success">{{ user.gems || 0 }}</div>
          </div>

          <!-- Quests Card -->
          <div class="card">
            <div class="text-sm text-gray-400 mb-1">Quests Completed</div>
            <div class="text-3xl font-bold text-secondary">{{ user.questsCompleted || 0 }}</div>
          </div>
        </div>

        <!-- Daily Login Rewards -->
        <div class="mb-8">
          <h2 class="text-2xl font-bold mb-4">📅 Daily Login Rewards</h2>
          <div v-if="loadingDaily" class="card">
            <p class="text-gray-400">Loading daily rewards...</p>
          </div>
          <div v-else-if="dailyStatus" class="card">
            <div v-if="dailyStatus.canClaim" class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-xl font-bold text-primary">Day {{ dailyStatus.data.rewardDay }} Reward Available!</h3>
                  <p class="text-gray-400">{{ dailyStatus.data.reward.description }}</p>
                </div>
                <button
                  @click="claimDaily"
                  :disabled="claiming"
                  class="btn btn-primary"
                >
                  {{ claiming ? 'Claiming...' : 'Claim Reward' }}
                </button>
              </div>
              <div class="flex gap-4 text-sm">
                <div v-if="dailyStatus.data.reward.currency" class="flex items-center gap-2">
                  <span class="text-2xl">💰</span>
                  <span class="text-warning font-bold">{{ dailyStatus.data.reward.currency }} Dakari</span>
                </div>
                <div v-if="dailyStatus.data.reward.gems" class="flex items-center gap-2">
                  <span class="text-2xl">💎</span>
                  <span class="text-success font-bold">{{ dailyStatus.data.reward.gems }} Gems</span>
                </div>
              </div>
              <div class="grid grid-cols-3 gap-4 pt-4 border-t border-dark-700">
                <div>
                  <p class="text-xs text-gray-500">Current Streak</p>
                  <p class="text-lg font-bold">{{ dailyStatus.data.currentStreak }} days</p>
                </div>
                <div>
                  <p class="text-xs text-gray-500">Longest Streak</p>
                  <p class="text-lg font-bold">{{ dailyStatus.data.longestStreak }} days</p>
                </div>
                <div>
                  <p class="text-xs text-gray-500">Total Logins</p>
                  <p class="text-lg font-bold">{{ dailyStatus.data.totalLogins }}</p>
                </div>
              </div>
            </div>
            <div v-else class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-xl font-bold text-gray-400">✅ Already Claimed Today</h3>
                  <p class="text-gray-500">Come back tomorrow for your next reward!</p>
                </div>
              </div>
              <div class="grid grid-cols-3 gap-4 pt-4 border-t border-dark-700">
                <div>
                  <p class="text-xs text-gray-500">Current Streak</p>
                  <p class="text-lg font-bold text-primary">{{ dailyStatus.data.currentStreak }} days</p>
                </div>
                <div>
                  <p class="text-xs text-gray-500">Longest Streak</p>
                  <p class="text-lg font-bold">{{ dailyStatus.data.longestStreak }} days</p>
                </div>
                <div>
                  <p class="text-xs text-gray-500">Next in</p>
                  <p class="text-lg font-bold">~{{ dailyStatus.data.hoursUntilNext }}h</p>
                </div>
              </div>
              <div v-if="dailyStatus.data.nextReward" class="pt-4 border-t border-dark-700">
                <p class="text-sm text-gray-400 mb-2">Tomorrow's Reward:</p>
                <div class="flex gap-4">
                  <span v-if="dailyStatus.data.nextReward.currency" class="text-warning">
                    💰 {{ dailyStatus.data.nextReward.currency }} Dakari
                  </span>
                  <span v-if="dailyStatus.data.nextReward.gems" class="text-success">
                    💎 {{ dailyStatus.data.nextReward.gems }} Gems
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <router-link to="/quests" class="card-hover">
            <h3 class="text-xl font-bold mb-2">📜 Active Quests</h3>
            <p class="text-gray-400">View and complete available quests</p>
          </router-link>

          <router-link to="/bosses" class="card-hover">
            <h3 class="text-xl font-bold mb-2">🐉 Boss Battles</h3>
            <p class="text-gray-400">Fight the active world boss</p>
          </router-link>
        </div>
      </div>
    </main>

  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import axios from 'axios'

const authStore = useAuthStore()
const user = ref(null)
const loading = ref(true)
const loadingDaily = ref(true)
const dailyStatus = ref(null)
const claiming = ref(false)

async function checkDaily() {
  try {
    const response = await axios.get('/api/v1/daily/check')
    dailyStatus.value = response.data
  } catch (error) {
    console.error('Error checking daily:', error)
  } finally {
    loadingDaily.value = false
  }
}

async function claimDaily() {
  claiming.value = true
  try {
    const response = await axios.post('/api/v1/daily/claim')
    if (response.data.success) {
      // Refresh user data and daily status
      await authStore.checkAuth()
      user.value = authStore.user
      await checkDaily()

      // Show success message
      alert(`✅ ${response.data.message}\n\nYou received:\n${response.data.data.reward.currency ? `💰 ${response.data.data.reward.currency} Dakari\n` : ''}${response.data.data.reward.gems ? `💎 ${response.data.data.reward.gems} Gems` : ''}`)
    }
  } catch (error) {
    console.error('Error claiming daily:', error)
    alert('❌ Failed to claim daily reward')
  } finally {
    claiming.value = false
  }
}

onMounted(async () => {
  // Check for token in URL (from OAuth redirect)
  const urlParams = new URLSearchParams(window.location.search)
  const token = urlParams.get('token')

  if (token) {
    // Store the token
    authStore.setToken(token)

    // Clean up URL (remove token parameter)
    window.history.replaceState({}, document.title, window.location.pathname)
  }

  await authStore.checkAuth()
  user.value = authStore.user
  loading.value = false

  // Check daily login status
  if (user.value) {
    await checkDaily()
  }
})
</script>

<style scoped>
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
