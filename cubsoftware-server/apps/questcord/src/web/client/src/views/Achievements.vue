<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import axios from 'axios'

const authStore = useAuthStore()
const loading = ref(false)
const achievements = ref([])
const stats = ref({ total: 0, unlocked: 0, totalPoints: 0, percentage: 0 })
const error = ref(null)
const selectedCategory = ref('all')
const selectedRarity = ref('all')

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://cubsoftware.site'

// Auto-refresh every 60 seconds
let refreshInterval = null

// Rarity colors
const RARITY_COLORS = {
  common: '#9CA3AF',
  uncommon: '#10B981',
  rare: '#3B82F6',
  epic: '#8B5CF6',
  legendary: '#F59E0B'
}

const categories = [
  { value: 'all', label: 'All Categories', emoji: '📋' },
  { value: 'combat', label: 'Combat', emoji: '⚔️' },
  { value: 'exploration', label: 'Exploration', emoji: '🗺️' },
  { value: 'mastery', label: 'Mastery', emoji: '⬆️' },
  { value: 'collection', label: 'Collection', emoji: '💰' },
  { value: 'social', label: 'Social', emoji: '👥' },
  { value: 'special', label: 'Special', emoji: '✨' }
]

const rarities = [
  { value: 'all', label: 'All Rarities' },
  { value: 'common', label: 'Common' },
  { value: 'uncommon', label: 'Uncommon' },
  { value: 'rare', label: 'Rare' },
  { value: 'epic', label: 'Epic' },
  { value: 'legendary', label: 'Legendary' }
]

onMounted(async () => {
  await fetchAchievements()

  // Set up auto-refresh
  refreshInterval = setInterval(async () => {
    if (authStore.isAuthenticated) {
      await fetchAchievements()
    }
  }, 60000) // 60 seconds
})

// Clean up interval on unmount
import { onUnmounted } from 'vue'
onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})

async function fetchAchievements() {
  if (!authStore.isAuthenticated) {
    authStore.login()
    return
  }

  loading.value = true
  error.value = null

  try {
    const [achievementsResponse, statsResponse] = await Promise.all([
      axios.get(`${API_BASE}/api/v1/achievements`, {
        headers: { Authorization: `Bearer ${authStore.token}` }
      }),
      axios.get(`${API_BASE}/api/v1/achievements/stats`, {
        headers: { Authorization: `Bearer ${authStore.token}` }
      })
    ])

    achievements.value = achievementsResponse.data.data || []
    stats.value = statsResponse.data.data || { total: 0, unlocked: 0, totalPoints: 0, percentage: 0 }
  } catch (err) {
    error.value = err.response?.data?.message || 'Failed to load achievements'
    console.error('Error fetching achievements:', err)
  } finally {
    loading.value = false
  }
}

const filteredAchievements = computed(() => {
  return achievements.value.filter(achievement => {
    const categoryMatch = selectedCategory.value === 'all' || achievement.category === selectedCategory.value
    const rarityMatch = selectedRarity.value === 'all' || achievement.rarity === selectedRarity.value
    return categoryMatch && rarityMatch
  })
})

const groupedAchievements = computed(() => {
  const grouped = {}
  filteredAchievements.value.forEach(achievement => {
    if (!grouped[achievement.category]) {
      grouped[achievement.category] = []
    }
    grouped[achievement.category].push(achievement)
  })
  return grouped
})

function getRarityColor(rarity) {
  return RARITY_COLORS[rarity] || RARITY_COLORS.common
}

function getRarityGradient(rarity) {
  const color = getRarityColor(rarity)
  return `linear-gradient(135deg, ${color}33 0%, ${color}11 100%)`
}

function getProgressPercentage(achievement) {
  if (!achievement.criteria_value) return 0
  return Math.min(100, Math.round((achievement.progress / achievement.criteria_value) * 100))
}

function formatTime(timestamp) {
  const date = new Date(timestamp * 1000)
  return date.toLocaleDateString()
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
          <router-link to="/bosses" class="btn btn-secondary">Bosses</router-link>
          <router-link to="/profile" class="btn btn-secondary">My Profile</router-link>
          <button v-if="authStore.isAuthenticated" @click="authStore.logout()" class="btn btn-secondary" style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); border: none;">Logout</button>
          <button v-else @click="authStore.login()" class="btn btn-secondary" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); border: none;">Login</button>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <main class="container mx-auto px-4 py-8 flex-1">
      <!-- Stats Header -->
      <div class="mb-8">
        <!-- Page Header -->
        <div class="text-center mb-6">
          <div class="flex items-center justify-center gap-3 mb-3">
            <div class="text-5xl">🏆</div>
            <h2 class="text-4xl font-bold bg-gradient-to-r from-yellow-500 to-orange-400 bg-clip-text text-transparent">
              Achievements
            </h2>
          </div>
          <p class="text-gray-400 text-lg">Track your progress and unlock special rewards</p>
          <p class="text-xs text-gray-500 mt-2">Updates automatically every 60 seconds</p>
        </div>

        <!-- Achievement Stats -->
        <div v-if="!loading && authStore.isAuthenticated" class="bg-dark-800 rounded-lg p-6 mb-6 border border-dark-700">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
            <div class="text-center">
              <div class="text-4xl font-bold text-primary mb-1">{{ stats.unlocked }}</div>
              <div class="text-sm text-gray-400">Unlocked</div>
            </div>
            <div class="text-center">
              <div class="text-4xl font-bold text-gray-300 mb-1">{{ stats.total }}</div>
              <div class="text-sm text-gray-400">Total</div>
            </div>
            <div class="text-center">
              <div class="text-4xl font-bold text-yellow-400 mb-1">{{ stats.totalPoints }}</div>
              <div class="text-sm text-gray-400">Points</div>
            </div>
            <div class="text-center">
              <div class="text-4xl font-bold text-green-400 mb-1">{{ stats.percentage }}%</div>
              <div class="text-sm text-gray-400">Completion</div>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="mt-6">
            <div class="w-full bg-dark-700 rounded-full h-4 overflow-hidden border border-dark-600">
              <div
                class="h-full bg-gradient-to-r from-primary to-purple-500 transition-all duration-500"
                :style="{ width: stats.percentage + '%' }"
              ></div>
            </div>
          </div>
        </div>

        <!-- Filters -->
        <div class="flex flex-col md:flex-row gap-4 mb-6">
          <!-- Category Filter -->
          <div class="flex-1">
            <label class="block text-sm text-gray-400 mb-2">Category</label>
            <select v-model="selectedCategory" class="w-full bg-dark-800 border border-dark-700 rounded px-4 py-2 text-white">
              <option v-for="cat in categories" :key="cat.value" :value="cat.value">
                {{ cat.emoji }} {{ cat.label }}
              </option>
            </select>
          </div>

          <!-- Rarity Filter -->
          <div class="flex-1">
            <label class="block text-sm text-gray-400 mb-2">Rarity</label>
            <select v-model="selectedRarity" class="w-full bg-dark-800 border border-dark-700 rounded px-4 py-2 text-white">
              <option v-for="rarity in rarities" :key="rarity.value" :value="rarity.value">
                {{ rarity.label }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="text-center py-12">
        <div class="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto"></div>
        <p class="mt-4 text-gray-400">Loading achievements...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="bg-red-900/20 border border-red-500 rounded-lg p-6 text-center">
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchAchievements" class="btn btn-primary mt-4">Try Again</button>
      </div>

      <!-- Achievements Grid -->
      <div v-else-if="filteredAchievements.length > 0">
        <div v-for="(categoryAchievements, category) in groupedAchievements" :key="category" class="mb-8">
          <!-- Category Header -->
          <h3 class="text-2xl font-bold mb-4 flex items-center gap-2">
            <span>{{ categories.find(c => c.value === category)?.emoji }}</span>
            <span class="capitalize">{{ category }}</span>
            <span class="text-sm text-gray-400 font-normal ml-2">
              ({{ categoryAchievements.filter(a => a.unlocked === 1).length }}/{{ categoryAchievements.length }})
            </span>
          </h3>

          <!-- Achievement Cards -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="achievement in categoryAchievements"
              :key="achievement.id"
              class="bg-dark-800 rounded-lg p-5 border-2 transition-all hover:scale-105"
              :class="achievement.unlocked === 1 ? 'border-opacity-50' : 'border-dark-700 opacity-75'"
              :style="{
                borderColor: achievement.unlocked === 1 ? getRarityColor(achievement.rarity) : '',
                background: achievement.unlocked === 1 ? getRarityGradient(achievement.rarity) : ''
              }"
            >
              <!-- Achievement Header -->
              <div class="flex items-start justify-between mb-3">
                <div class="flex items-center gap-3">
                  <div class="text-4xl">{{ achievement.icon || '🏆' }}</div>
                  <div>
                    <h4 class="font-bold text-lg">{{ achievement.name }}</h4>
                    <span
                      class="text-xs font-medium px-2 py-1 rounded capitalize"
                      :style="{ color: getRarityColor(achievement.rarity) }"
                    >
                      {{ achievement.rarity }}
                    </span>
                  </div>
                </div>
                <div v-if="achievement.unlocked === 1" class="text-2xl">✅</div>
                <div v-else class="text-2xl opacity-30">🔒</div>
              </div>

              <!-- Achievement Description -->
              <p class="text-sm text-gray-400 mb-3">{{ achievement.description }}</p>

              <!-- Progress Bar (if not unlocked and has progress) -->
              <div v-if="achievement.unlocked !== 1 && achievement.criteria_value" class="mb-3">
                <div class="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Progress</span>
                  <span>{{ achievement.progress || 0 }} / {{ achievement.criteria_value }}</span>
                </div>
                <div class="w-full bg-dark-700 rounded-full h-2 overflow-hidden">
                  <div
                    class="h-full transition-all duration-500"
                    :style="{
                      width: getProgressPercentage(achievement) + '%',
                      background: getRarityColor(achievement.rarity)
                    }"
                  ></div>
                </div>
              </div>

              <!-- Achievement Footer -->
              <div class="flex items-center justify-between text-xs">
                <span class="text-yellow-400">⭐ {{ achievement.points }} points</span>
                <span v-if="achievement.unlocked === 1 && achievement.unlocked_at" class="text-gray-500">
                  {{ formatTime(achievement.unlocked_at) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- No Achievements State -->
      <div v-else class="text-center py-12">
        <div class="text-6xl mb-4">🏆</div>
        <h3 class="text-2xl font-bold mb-2">No Achievements Found</h3>
        <p class="text-gray-400">Try adjusting your filters or start playing to unlock achievements!</p>
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
