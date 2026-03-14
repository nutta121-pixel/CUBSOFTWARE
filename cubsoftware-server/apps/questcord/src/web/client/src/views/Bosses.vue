<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import axios from 'axios'

const authStore = useAuthStore()
const loading = ref(false)
const boss = ref(null)
const participants = ref([])
const error = ref(null)
const attacking = ref(false)
const lastAttack = ref(null)

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://cubsoftware.site'

// Auto-refresh every 10 seconds
let refreshInterval = null

onMounted(async () => {
  await fetchBoss()

  // Set up auto-refresh
  refreshInterval = setInterval(async () => {
    await fetchBoss(true) // Silent refresh
  }, 10000)
})

// Clean up interval on unmount
import { onUnmounted } from 'vue'
onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})

async function fetchBoss(silent = false) {
  if (!silent) loading.value = true
  error.value = null

  try {
    const response = await axios.get(`${API_BASE}/api/v1/bosses/active`)

    if (response.data.success && response.data.data) {
      boss.value = response.data.data

      // Fetch participants if boss exists
      if (boss.value.id) {
        await fetchParticipants(boss.value.id)
      }
    } else {
      boss.value = null
      participants.value = []
    }
  } catch (err) {
    error.value = err.response?.data?.message || 'Failed to load boss'
    console.error('Error fetching boss:', err)
  } finally {
    if (!silent) loading.value = false
  }
}

async function fetchParticipants(bossId) {
  try {
    const response = await axios.get(`${API_BASE}/api/v1/bosses/${bossId}/participants`)

    if (response.data.success) {
      participants.value = response.data.data || []
    }
  } catch (err) {
    console.error('Error fetching participants:', err)
  }
}

async function attackBoss() {
  if (!authStore.isAuthenticated) {
    authStore.login()
    return
  }

  if (!boss.value || boss.value.current_hp <= 0) {
    alert('No active boss to attack!')
    return
  }

  attacking.value = true

  try {
    const response = await axios.post(
      `${API_BASE}/api/v1/bosses/${boss.value.id}/attack`,
      {},
      { headers: { Authorization: `Bearer ${authStore.token}` } }
    )

    if (response.data.success) {
      lastAttack.value = response.data.data
      await fetchBoss()

      // Show attack result
      const result = response.data.data
      alert(`You dealt ${result.damage_dealt} damage! ${result.critical_hit ? '💥 CRITICAL HIT!' : ''}`)
    }
  } catch (err) {
    alert(err.response?.data?.message || 'Failed to attack boss')
  } finally {
    attacking.value = false
  }
}

const bossHpPercentage = computed(() => {
  if (!boss.value) return 0
  return Math.max(0, (boss.value.current_hp / boss.value.max_hp) * 100)
})

const bossHpColor = computed(() => {
  const percentage = bossHpPercentage.value
  if (percentage > 60) return 'bg-green-500'
  if (percentage > 30) return 'bg-yellow-500'
  return 'bg-red-500'
})

function formatNumber(num) {
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M'
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K'
  return num.toString()
}

function formatTime(timestamp) {
  const date = new Date(timestamp * 1000)
  return date.toLocaleString()
}

function getTimeRemaining() {
  if (!boss.value || !boss.value.expires_at) return 'Unknown'

  const now = Math.floor(Date.now() / 1000)
  const remaining = boss.value.expires_at - now

  if (remaining <= 0) return 'Expired'

  const hours = Math.floor(remaining / 3600)
  const minutes = Math.floor((remaining % 3600) / 60)

  return `${hours}h ${minutes}m`
}
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
          <router-link to="/dashboard" class="btn btn-primary">Dashboard</router-link>
          <router-link to="/quests" class="btn btn-secondary">Quests</router-link>
          <router-link to="/guilds" class="btn btn-secondary">Guilds</router-link>
          <router-link to="/profile" class="btn btn-secondary">Profile</router-link>
          <button v-if="authStore.isAuthenticated" @click="authStore.logout()" class="btn btn-secondary" style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); border: none;">Logout</button>
          <button v-else @click="authStore.login()" class="btn btn-secondary" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); border: none;">Login</button>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <main class="container mx-auto px-4 py-8 flex-1">
      <!-- Page Header -->
      <div class="mb-8 text-center">
        <div class="flex items-center justify-center gap-3 mb-3">
          <div class="text-5xl">🐉</div>
          <h2 class="text-4xl font-bold bg-gradient-to-r from-red-500 to-orange-400 bg-clip-text text-transparent">
            Boss Battles
          </h2>
        </div>
        <p class="text-gray-400 text-lg">Join forces to defeat powerful world bosses</p>
        <p class="text-xs text-gray-500 mt-2">Updates automatically every 10 seconds</p>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="text-center py-12">
        <div class="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto"></div>
        <p class="mt-4 text-gray-400">Loading boss...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="bg-red-900/20 border border-red-500 rounded-lg p-6 text-center">
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchBoss()" class="btn btn-primary mt-4">Try Again</button>
      </div>

      <!-- Boss Display -->
      <div v-else-if="boss" class="max-w-4xl mx-auto">
        <!-- Boss Header -->
        <div class="bg-dark-800 rounded-lg p-4 md:p-8 mb-6 border-2 border-red-500/50">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
            <div>
              <h3 class="text-2xl md:text-4xl font-bold mb-2 text-red-400">{{ boss.name }}</h3>
              <div class="flex gap-4 text-sm">
                <span class="text-gray-400">Level {{ boss.level }}</span>
                <span class="text-yellow-400">⏱️ {{ getTimeRemaining() }}</span>
              </div>
            </div>
            <div class="text-right">
              <div class="text-2xl font-bold text-red-500">{{ boss.current_hp > 0 ? '☠️ ALIVE' : '💀 DEFEATED' }}</div>
            </div>
          </div>

          <!-- HP Bar -->
          <div class="mb-6">
            <div class="flex justify-between text-sm mb-2">
              <span class="text-gray-400">Health</span>
              <span class="text-white font-bold">{{ formatNumber(boss.current_hp) }} / {{ formatNumber(boss.max_hp) }} HP</span>
            </div>
            <div class="w-full bg-dark-700 rounded-full h-8 overflow-hidden border-2 border-dark-600">
              <div
                :class="['h-full transition-all duration-500 rounded-full', bossHpColor]"
                :style="{ width: bossHpPercentage + '%' }"
              >
                <div class="h-full flex items-center justify-center text-white text-sm font-bold">
                  {{ Math.round(bossHpPercentage) }}%
                </div>
              </div>
            </div>
          </div>

          <!-- Boss Stats -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-dark-900/50 rounded p-4 text-center">
              <div class="text-2xl font-bold text-red-400">{{ boss.attack }}</div>
              <div class="text-xs text-gray-400">Attack</div>
            </div>
            <div class="bg-dark-900/50 rounded p-4 text-center">
              <div class="text-2xl font-bold text-blue-400">{{ boss.defense }}</div>
              <div class="text-xs text-gray-400">Defense</div>
            </div>
            <div class="bg-dark-900/50 rounded p-4 text-center">
              <div class="text-2xl font-bold text-yellow-400">{{ formatNumber(boss.reward_currency) }}</div>
              <div class="text-xs text-gray-400">Dakari Reward</div>
            </div>
            <div class="bg-dark-900/50 rounded p-4 text-center">
              <div class="text-2xl font-bold text-purple-400">{{ formatNumber(boss.reward_experience) }}</div>
              <div class="text-xs text-gray-400">XP Reward</div>
            </div>
          </div>

          <!-- Attack Button -->
          <button
            @click="attackBoss"
            :disabled="attacking || boss.current_hp <= 0 || !authStore.isAuthenticated"
            class="btn btn-primary w-full text-xl py-4"
            :class="{ 'opacity-50 cursor-not-allowed': boss.current_hp <= 0 }"
          >
            {{ attacking ? '⚔️ Attacking...' : boss.current_hp <= 0 ? '💀 Boss Defeated' : '⚔️ Attack Boss' }}
          </button>

          <div v-if="!authStore.isAuthenticated" class="text-center mt-4 text-sm text-gray-400">
            Please login to attack the boss
          </div>
        </div>

        <!-- Participants Leaderboard -->
        <div class="bg-dark-800 rounded-lg p-6">
          <h3 class="text-2xl font-bold mb-4">Top Attackers</h3>

          <div v-if="participants.length > 0" class="space-y-2">
            <div
              v-for="(participant, index) in participants.slice(0, 10)"
              :key="participant.user_id"
              class="flex items-center justify-between bg-dark-700 rounded p-4 hover:bg-dark-600 transition-colors"
            >
              <div class="flex items-center gap-4">
                <div class="text-2xl font-bold text-gray-500">#{index + 1}</div>
                <div>
                  <div class="font-bold">{{ participant.username }}</div>
                  <div class="text-sm text-gray-400">{{ participant.attack_count }} attacks</div>
                </div>
              </div>
              <div class="text-right">
                <div class="font-bold text-red-400">{{ formatNumber(participant.total_damage) }} damage</div>
              </div>
            </div>
          </div>

          <div v-else class="text-center py-8 text-gray-400">
            No one has attacked yet. Be the first!
          </div>
        </div>
      </div>

      <!-- No Boss State -->
      <div v-else class="text-center py-12">
        <div class="text-6xl mb-4">😴</div>
        <h3 class="text-2xl font-bold mb-2">No Active Boss</h3>
        <p class="text-gray-400">A new boss will spawn soon. Check back later!</p>
      </div>
    </main>

  </div>
</template>

<style scoped>
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
