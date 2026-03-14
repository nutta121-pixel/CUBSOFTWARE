<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import axios from 'axios'

const authStore = useAuthStore()
const loading = ref(false)
const rewards = ref([])
const stats = ref(null)
const canClaim = ref(false)
const nextReward = ref(null)
const claimStatus = ref(null)
const error = ref(null)

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://cubsoftware.site'

onMounted(async () => {
  await Promise.all([
    fetchRewards(),
    fetchStats(),
    checkClaim()
  ])
})

async function fetchRewards() {
  try {
    const response = await axios.get(`${API_BASE}/api/v1/daily/rewards`)
    rewards.value = response.data.data || []
  } catch (err) {
    console.error('Error fetching rewards:', err)
  }
}

async function fetchStats() {
  if (!authStore.user) return

  try {
    const token = localStorage.getItem('authToken')
    const response = await axios.get(`${API_BASE}/api/v1/daily/stats`, {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (response.data.success) {
      stats.value = response.data.data
    }
  } catch (err) {
    console.error('Error fetching stats:', err)
  }
}

async function checkClaim() {
  if (!authStore.user) return

  try {
    const token = localStorage.getItem('authToken')
    const response = await axios.get(`${API_BASE}/api/v1/daily/check`, {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (response.data.success) {
      canClaim.value = response.data.data.canClaim
      nextReward.value = response.data.data.reward
      claimStatus.value = response.data
    }
  } catch (err) {
    console.error('Error checking claim:', err)
  }
}

async function claimReward() {
  if (!authStore.user || !canClaim.value) return

  loading.value = true
  error.value = null

  try {
    const token = localStorage.getItem('authToken')
    const response = await axios.post(`${API_BASE}/api/v1/daily/claim`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (response.data.success) {
      // Refresh data
      await Promise.all([
        fetchStats(),
        checkClaim()
      ])

      claimStatus.value = response.data
    } else {
      error.value = response.data.error || 'Failed to claim reward'
    }
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to claim reward'
    console.error('Error claiming reward:', err)
  } finally {
    loading.value = false
  }
}

const currentRewardDay = computed(() => {
  if (!stats.value) return 1
  return ((stats.value.currentStreak || 0) % 7) + 1
})

const formatNumber = (num) => num?.toLocaleString() || '0'
</script>

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
          <router-link to="/dashboard" class="btn btn-secondary">Dashboard</router-link>
          <router-link to="/quests" class="btn btn-secondary">Quests</router-link>
          <router-link to="/bosses" class="btn btn-secondary">Bosses</router-link>
          <router-link to="/profile" class="btn btn-secondary">My Profile</router-link>
          <router-link to="/daily" class="btn btn-primary">Daily Rewards</router-link>
          <button v-if="authStore.isAuthenticated" @click="authStore.logout()" class="btn btn-secondary" style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); border: none;">Logout</button>
          <button v-else @click="authStore.login()" class="btn btn-secondary" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); border: none;">Login</button>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <main class="container mx-auto px-4 py-8 flex-1">
      <!-- Login Statistics -->
      <div v-if="stats" class="bg-dark-800 rounded-lg shadow-lg p-8 mb-8">
        <h2 class="text-2xl font-bold mb-6">📊 Your Login Statistics</h2>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="card-hover">
            <div class="text-gray-400 text-sm mb-2">Current Streak</div>
            <div class="text-2xl md:text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              {{ stats.currentStreak || 0 }} days
            </div>
          </div>

          <div class="card-hover">
            <div class="text-gray-400 text-sm mb-2">Longest Streak</div>
            <div class="text-2xl md:text-4xl font-bold text-yellow-400">
              {{ stats.longestStreak || 0 }} days
            </div>
          </div>

          <div class="card-hover">
            <div class="text-gray-400 text-sm mb-2">Total Logins</div>
            <div class="text-2xl md:text-4xl font-bold text-green-400">
              {{ stats.totalLogins || 0 }}
            </div>
          </div>
        </div>
      </div>

      <!-- Claim Reward Section -->
      <div v-if="authStore.user" class="bg-dark-800 rounded-lg shadow-lg p-8 mb-8">
        <h2 class="text-2xl font-bold mb-6">🎁 Daily Reward</h2>

        <!-- Can Claim -->
        <div v-if="canClaim" class="text-center">
          <div class="mb-6">
            <div class="text-6xl mb-4">📅</div>
            <h3 class="text-2xl font-bold mb-2">Day {{ currentRewardDay }} Reward Available!</h3>
            <p class="text-gray-400">Click below to claim your reward</p>
          </div>

          <div v-if="nextReward" class="bg-dark-700 rounded-lg p-6 mb-6 max-w-md mx-auto">
            <div class="text-lg font-semibold mb-4">Reward:</div>
            <div class="space-y-2">
              <div v-if="nextReward.currency" class="text-xl">
                💰 <span class="text-yellow-400 font-bold">{{ formatNumber(nextReward.currency) }}</span> Dakari
              </div>
              <div v-if="nextReward.gems" class="text-xl">
                💎 <span class="text-purple-400 font-bold">{{ nextReward.gems }}</span> Gems
              </div>
              <div v-if="nextReward.item_id" class="text-xl">
                🎁 Special Item
              </div>
            </div>
          </div>

          <button
            @click="claimReward"
            :disabled="loading"
            class="btn btn-primary text-lg md:text-xl px-6 md:px-12 py-4"
          >
            {{ loading ? 'Claiming...' : 'Claim Reward' }}
          </button>

          <div v-if="error" class="mt-4 text-red-500">
            {{ error }}
          </div>
        </div>

        <!-- Already Claimed -->
        <div v-else class="text-center">
          <div class="text-6xl mb-4">✅</div>
          <h3 class="text-2xl font-bold mb-2">Reward Already Claimed!</h3>
          <p class="text-gray-400 mb-4">Come back tomorrow for your next reward</p>

          <div v-if="claimStatus && claimStatus.data" class="text-gray-400">
            Next reward available in ~{{ claimStatus.data.hoursUntilNext }} hours
          </div>
        </div>
      </div>

      <!-- Login Required -->
      <div v-else class="bg-dark-800 rounded-lg shadow-lg p-8 mb-8 text-center">
        <div class="text-6xl mb-4">🔒</div>
        <h3 class="text-2xl font-bold mb-4">Login Required</h3>
        <p class="text-gray-400 mb-6">Please login to claim your daily rewards</p>
        <router-link to="/auth/discord/login" class="btn btn-primary">
          Login with Discord
        </router-link>
      </div>

      <!-- 7-Day Reward Calendar -->
      <div class="bg-dark-800 rounded-lg shadow-lg p-8">
        <h2 class="text-2xl font-bold mb-6">📅 7-Day Reward Cycle</h2>
        <p class="text-gray-400 mb-6">
          Login every day to claim these rewards and build your streak! After Day 7, the cycle repeats.
        </p>

        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-2 sm:gap-4">
          <div
            v-for="reward in rewards"
            :key="reward.day"
            class="card-hover relative"
            :class="{
              'ring-2 ring-primary': currentRewardDay === reward.day && canClaim,
              'opacity-50': stats && stats.currentStreak > 0 && reward.day < currentRewardDay
            }"
          >
            <!-- Current Day Indicator -->
            <div
              v-if="currentRewardDay === reward.day && canClaim"
              class="absolute -top-2 -right-2 bg-primary text-white text-xs font-bold px-2 py-1 rounded-full"
            >
              NOW
            </div>

            <div class="text-center">
              <div class="text-3xl mb-2">{{ reward.day === 7 ? '🎉' : '📦' }}</div>
              <div class="font-bold text-lg mb-3">Day {{ reward.day }}</div>

              <div class="space-y-1 text-sm">
                <div v-if="reward.currency" class="text-yellow-400">
                  💰 {{ formatNumber(reward.currency) }} Dakari
                </div>
                <div v-if="reward.gems" class="text-purple-400">
                  💎 {{ reward.gems }} Gems
                </div>
                <div v-if="reward.item_id" class="text-blue-400">
                  🎁 Special Item
                </div>
              </div>

              <div v-if="reward.description" class="text-xs text-gray-500 mt-2 italic">
                {{ reward.description }}
              </div>
            </div>
          </div>
        </div>

        <div class="mt-8 p-4 bg-dark-700 rounded-lg">
          <h3 class="font-bold mb-2">📌 How It Works</h3>
          <ul class="text-sm text-gray-400 space-y-1 list-disc list-inside">
            <li>Login daily to claim rewards automatically</li>
            <li>Your streak resets if you miss a day</li>
            <li>After Day 7, the cycle repeats starting from Day 1</li>
            <li>Build longer streaks to show your dedication!</li>
          </ul>
        </div>
      </div>
    </main>

  </div>
</template>

<style scoped>
.card-hover {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 1.5rem;
  transition: all 0.3s ease;
}

.card-hover:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(88, 101, 242, 0.5);
  transform: translateY(-2px);
}

.bg-dark-700 {
  background-color: #2c2f33;
}

.bg-dark-800 {
  background-color: #23272a;
}
</style>
