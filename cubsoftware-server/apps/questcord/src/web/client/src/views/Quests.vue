<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import axios from 'axios'
import QuestMinigame from '../components/minigames/QuestMinigame.vue'

const authStore = useAuthStore()
const loading = ref(false)
const initialLoading = ref(true) // Only show spinner on first load
const quests = ref([])
const userQuests = ref([])
const error = ref(null)
const selectedServer = ref(null)
const userServers = ref([])
const currentServer = ref(null)
const traveling = ref(false)
const travelProgress = ref(0)
const travelDestination = ref(null)
const travelArrivalTime = ref(null)

// Minigame state
const showMinigame = ref(false)
const activeChallenge = ref(null)
const selectedQuest = ref(null)

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://cubsoftware.site'

// Auto-refresh
let refreshInterval = null
let travelCheckInterval = null

onMounted(async () => {
  await checkTravelStatus()
  await fetchUserServers()

  if (userServers.value.length > 0) {
    if (!currentServer.value) {
      currentServer.value = userServers.value[0].id
    }
    selectedServer.value = currentServer.value

    if (!traveling.value) {
      await fetchQuests()
    }
  }

  // Set up intervals based on travel status
  startRefreshIntervals()
})

function startRefreshIntervals() {
  // Clear existing intervals
  if (refreshInterval) clearInterval(refreshInterval)
  if (travelCheckInterval) clearInterval(travelCheckInterval)

  if (traveling.value) {
    // When traveling, check status every second
    travelCheckInterval = setInterval(async () => {
      await checkTravelStatus()
      updateTravelProgress()
    }, 1000)
  } else {
    // When not traveling, refresh quests silently every 60 seconds
    refreshInterval = setInterval(async () => {
      if (selectedServer.value && !traveling.value) {
        await fetchQuests(true) // Silent refresh
      }
    }, 60000)
  }
}

// Clean up intervals on unmount
onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval)
  if (travelCheckInterval) clearInterval(travelCheckInterval)
  if (countdownInterval) clearInterval(countdownInterval)
})

async function checkTravelStatus() {
  if (!authStore.isAuthenticated) return

  try {
    const response = await axios.get(`${API_BASE}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${authStore.token}` }
    })

    if (response.data.success) {
      const user = response.data.data
      const now = Math.floor(Date.now() / 1000)

      if (user.traveling && user.travel_arrives_at > now) {
        traveling.value = true
        travelDestination.value = user.travel_destination
        travelArrivalTime.value = user.travel_arrives_at
        currentServer.value = user.current_server || userServers.value[0]?.id
        updateTravelProgress()
      } else {
        const wasTraveling = traveling.value
        traveling.value = false
        currentServer.value = user.current_server || userServers.value[0]?.id
        selectedServer.value = currentServer.value

        // Restart intervals if travel just completed
        if (wasTraveling) {
          startRefreshIntervals()
          await fetchQuests(true) // Silent refresh after travel
        }
      }
    }
  } catch (err) {
    console.error('Error checking travel status:', err)
  }
}

function updateTravelProgress() {
  if (!traveling.value || !travelArrivalTime.value) return

  const now = Math.floor(Date.now() / 1000)
  const totalTime = travelArrivalTime.value - (travelArrivalTime.value - 300) // Assume 5 min travel
  const elapsed = now - (travelArrivalTime.value - 300)
  travelProgress.value = Math.min(100, Math.max(0, (elapsed / 300) * 100))

  if (now >= travelArrivalTime.value) {
    traveling.value = false
    currentServer.value = travelDestination.value
    selectedServer.value = currentServer.value
    fetchQuests(true) // Silent refresh when travel completes
  }
}

async function handleServerChange() {
  if (!authStore.isAuthenticated) {
    authStore.login()
    return
  }

  if (selectedServer.value === currentServer.value) {
    // Same server, just refresh quests
    await fetchQuests()
    return
  }

  // Start travel to new server
  try {
    const response = await axios.post(
      `${API_BASE}/api/v1/travel`,
      { destination: selectedServer.value },
      { headers: { Authorization: `Bearer ${authStore.token}` } }
    )

    if (response.data.success) {
      traveling.value = true
      travelDestination.value = selectedServer.value
      travelArrivalTime.value = response.data.data.arrivesAt
      travelProgress.value = 0

      // Restart intervals for travel mode
      startRefreshIntervals()
    }
  } catch (err) {
    alert(err.response?.data?.message || 'Failed to start travel')
    selectedServer.value = currentServer.value
  }
}

async function fetchUserServers() {
  try {
    if (!authStore.isAuthenticated) {
      // Default server if not authenticated
      userServers.value = [
        { id: '1284593395188367502', name: 'CUB SOFTWARE' }
      ]
      return
    }

    const response = await axios.get(`${API_BASE}/api/v1/users/me/servers`, {
      headers: { Authorization: `Bearer ${authStore.token}` }
    })

    if (response.data.success && response.data.data.length > 0) {
      userServers.value = response.data.data
    } else {
      // Fallback to QuestCord server
      userServers.value = [
        { id: '1284593395188367502', name: 'CUB SOFTWARE' }
      ]
    }
  } catch (err) {
    console.error('Error fetching servers:', err)
    // Fallback to QuestCord server
    userServers.value = [
      { id: '1284593395188367502', name: 'CUB SOFTWARE' }
    ]
  }
}

async function fetchQuests(silent = false) {
  if (!selectedServer.value) return

  if (!silent) {
    loading.value = true
  }
  error.value = null

  try {
    const [questsResponse, userQuestsResponse] = await Promise.all([
      axios.get(`${API_BASE}/api/v1/quests?serverId=${selectedServer.value}`),
      authStore.isAuthenticated
        ? axios.get(`${API_BASE}/api/v1/quests/user?serverId=${selectedServer.value}`, {
            headers: { Authorization: `Bearer ${authStore.token}` }
          })
        : Promise.resolve({ data: { data: { quests: [] } } })
    ])

    quests.value = Array.isArray(questsResponse.data.data) ? questsResponse.data.data : []

    // Handle user quests - API returns { data: { quests: [...] } }
    const userQuestsData = userQuestsResponse.data.data
    if (userQuestsData && Array.isArray(userQuestsData.quests)) {
      userQuests.value = userQuestsData.quests
    } else if (Array.isArray(userQuestsData)) {
      userQuests.value = userQuestsData
    } else {
      userQuests.value = []
    }

    console.log('User quests loaded:', userQuests.value) // Debug log

    // Start countdown timer
    updateCountdowns()
    startCountdownTimer()
  } catch (err) {
    if (!silent) {
      error.value = err.response?.data?.message || 'Failed to load quests'
    }
    console.error('Error fetching quests:', err)
    if (!silent) {
      quests.value = []
      userQuests.value = []
    }
  } finally {
    loading.value = false
    initialLoading.value = false
  }
}

async function acceptQuest(questId) {
  if (!authStore.isAuthenticated) {
    authStore.login()
    return
  }

  try {
    // Fetch the challenge for this quest
    const response = await axios.post(
      `${API_BASE}/api/v1/quests/${questId}/accept`,
      {},
      { headers: { Authorization: `Bearer ${authStore.token}` } }
    )

    if (response.data.success && response.data.challenge) {
      // Show minigame modal with challenge
      selectedQuest.value = quests.value.find(q => q.id === questId)
      activeChallenge.value = response.data.challenge
      showMinigame.value = true
    } else if (response.data.success) {
      // Quest accepted without challenge (shouldn't happen in new system)
      await fetchQuests(true) // Silent refresh
    }
  } catch (err) {
    const errorMessage = err.response?.data?.error || err.response?.data?.message || 'Failed to accept quest'

    // Don't show alert for "already accepted" - just refresh to update UI
    if (errorMessage.toLowerCase().includes('already accepted')) {
      await fetchQuests(true) // Silent refresh
    } else {
      alert(errorMessage)
    }
  }
}

async function handleMinigameComplete(questId, challengeData) {
  try {
    const response = await axios.post(
      `${API_BASE}/api/v1/quests/${questId}/complete`,
      { challengeData },
      { headers: { Authorization: `Bearer ${authStore.token}` } }
    )

    if (response.data.success) {
      // Update UI silently in background
      fetchQuests(true)

      return {
        success: true,
        rewards: response.data.rewards || {
          currency: selectedQuest.value?.reward_currency || 0,
          gems: selectedQuest.value?.reward_gems || 0,
          xp: selectedQuest.value?.reward_experience || 0
        }
      }
    }

    return { success: false, message: response.data.message }
  } catch (err) {
    console.error('Error completing quest:', err)
    return { success: false, message: err.response?.data?.message || 'Failed to complete quest' }
  }
}

async function handleMinigameFail(questId) {
  try {
    await axios.post(
      `${API_BASE}/api/v1/quests/${questId}/fail`,
      {},
      { headers: { Authorization: `Bearer ${authStore.token}` } }
    )
    // Update UI silently in background
    fetchQuests(true)
  } catch (err) {
    console.error('Error failing quest:', err)
  }
}

function closeMinigame() {
  // If closing without completion, fail the quest
  if (selectedQuest.value && showMinigame.value) {
    handleMinigameFail(selectedQuest.value.id)
  }

  showMinigame.value = false
  activeChallenge.value = null
  selectedQuest.value = null
}

async function completeQuest(questId) {
  try {
    const response = await axios.post(
      `${API_BASE}/api/v1/quests/${questId}/complete`,
      {},
      { headers: { Authorization: `Bearer ${authStore.token}` } }
    )

    if (response.data.success) {
      await fetchQuests()
      alert(`Quest completed! +${response.data.data.rewards.experience} XP, +${response.data.data.rewards.currency} Dakari`)
    }
  } catch (err) {
    alert(err.response?.data?.message || 'Failed to complete quest')
  }
}

function getDifficultyColor(difficulty) {
  const colors = {
    easy: 'text-green-400',
    medium: 'text-yellow-400',
    hard: 'text-orange-400',
    expert: 'text-red-400'
  }
  return colors[difficulty] || 'text-gray-400'
}

// Countdown timer state
const countdowns = ref({})
let countdownInterval = null

function getTimeRemaining(expiresAt) {
  const now = Math.floor(Date.now() / 1000)
  const remaining = expiresAt - now

  if (remaining <= 0) {
    return 'Expired'
  }

  const hours = Math.floor(remaining / 3600)
  const minutes = Math.floor((remaining % 3600) / 60)
  const seconds = remaining % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  } else {
    return `${seconds}s`
  }
}

function updateCountdowns() {
  const newCountdowns = {}
  quests.value.forEach(quest => {
    if (quest.expires_at) {
      newCountdowns[quest.id] = getTimeRemaining(quest.expires_at)
    }
  })
  countdowns.value = newCountdowns
}

function startCountdownTimer() {
  if (countdownInterval) clearInterval(countdownInterval)

  countdownInterval = setInterval(() => {
    updateCountdowns()
  }, 1000)
}

function isQuestActive(questId) {
  return userQuests.value.some(q => q.quest_id === questId && q.status === 'active')
}

function isQuestCompleted(questId) {
  return userQuests.value.some(q => q.quest_id === questId && q.status === 'completed')
}

function isQuestFailed(questId) {
  return userQuests.value.some(q => q.quest_id === questId && q.status === 'failed')
}

// Sort quests by difficulty (easy -> medium -> hard -> expert)
const sortedQuests = computed(() => {
  const difficultyOrder = { easy: 1, medium: 2, hard: 3, expert: 4 }
  return [...quests.value].sort((a, b) => {
    return (difficultyOrder[a.difficulty] || 99) - (difficultyOrder[b.difficulty] || 99)
  })
})
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
      <!-- Page Header -->
      <div class="mb-8 text-center">
        <div class="flex items-center justify-center gap-3 mb-3">
          <div class="text-5xl">📜</div>
          <h2 class="text-4xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
            Available Quests
          </h2>
        </div>
        <p class="text-gray-400 text-lg mb-6">Embark on epic quests and earn valuable rewards</p>

        <!-- Server Selector -->
        <div class="flex items-center justify-center gap-4 max-w-2xl mx-auto">
          <label class="text-sm text-gray-400">Server:</label>
          <select
            v-model="selectedServer"
            @change="handleServerChange"
            :disabled="traveling"
            class="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-4 py-2 text-white hover:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option v-for="server in userServers" :key="server.id" :value="server.id">
              {{ server.name }}
            </option>
          </select>
        </div>
      </div>

      <!-- Travel Animation -->
      <div v-if="traveling" class="mb-8">
        <div class="bg-dark-800 rounded-lg p-8 border border-primary">
          <h3 class="text-2xl font-bold text-center mb-6">🚀 Traveling to {{ userServers.find(s => s.id === travelDestination)?.name }}...</h3>

          <!-- Travel Path Animation -->
          <div class="relative h-32 mb-6 overflow-hidden">
            <!-- Background Path -->
            <div class="absolute top-1/2 left-0 right-0 h-1 bg-dark-600 transform -translate-y-1/2"></div>

            <!-- Animated Progress Line -->
            <div
              class="absolute top-1/2 left-0 h-1 bg-gradient-to-r from-primary to-purple-500 transform -translate-y-1/2 transition-all duration-1000"
              :style="{ width: travelProgress + '%' }"
            ></div>

            <!-- Start Server Icon -->
            <div class="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-2">
              <div class="w-16 h-16 bg-dark-700 border-2 border-primary rounded-full flex items-center justify-center">
                <span class="text-2xl">🏰</span>
              </div>
              <div class="text-xs text-center text-gray-400 mt-2 whitespace-nowrap">
                {{ userServers.find(s => s.id === currentServer)?.name }}
              </div>
            </div>

            <!-- Traveling Ship Icon -->
            <div
              class="absolute top-1/2 transform -translate-y-1/2 -translate-x-1/2 transition-all duration-1000"
              :style="{ left: travelProgress + '%' }"
            >
              <div class="w-12 h-12 bg-gradient-to-r from-primary to-purple-500 rounded-full flex items-center justify-center animate-bounce">
                <span class="text-2xl">🚀</span>
              </div>
            </div>

            <!-- Destination Server Icon -->
            <div class="absolute right-0 top-1/2 transform -translate-y-1/2 translate-x-2">
              <div class="w-16 h-16 bg-dark-700 border-2 border-purple-500 rounded-full flex items-center justify-center">
                <span class="text-2xl">🏰</span>
              </div>
              <div class="text-xs text-center text-gray-400 mt-2 whitespace-nowrap">
                {{ userServers.find(s => s.id === travelDestination)?.name }}
              </div>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="w-full bg-dark-700 rounded-full h-4 overflow-hidden mb-4">
            <div
              class="h-full bg-gradient-to-r from-primary to-purple-500 transition-all duration-1000 flex items-center justify-center text-xs font-bold text-white"
              :style="{ width: travelProgress + '%' }"
            >
              {{ Math.round(travelProgress) }}%
            </div>
          </div>

          <!-- Time Remaining -->
          <p class="text-center text-gray-400">
            <span class="text-primary font-bold">{{ Math.max(0, Math.ceil((travelArrivalTime - Math.floor(Date.now() / 1000)) / 60)) }}</span> minutes remaining
          </p>
        </div>
      </div>

      <!-- Loading State (only on initial load) -->
      <div v-if="initialLoading && !traveling" class="text-center py-12">
        <div class="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto"></div>
        <p class="mt-4 text-gray-400">Loading quests...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error && !traveling" class="bg-red-900/20 border border-red-500 rounded-lg p-6 text-center">
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchQuests" class="btn btn-primary mt-4">Try Again</button>
      </div>

      <!-- Quests Grid -->
      <div v-else-if="sortedQuests.length > 0 && !traveling" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
        <div v-for="quest in sortedQuests" :key="quest.id" class="bg-dark-800 rounded-lg p-6 hover:bg-dark-700 transition-colors border border-dark-700">
          <!-- Quest Header -->
          <div class="flex justify-between items-start mb-4">
            <div>
              <h3 class="text-xl font-bold mb-1">{{ quest.name }}</h3>
              <span :class="['text-sm font-medium', getDifficultyColor(quest.difficulty)]">
                {{ quest.difficulty.toUpperCase() }}
              </span>
            </div>
            <!-- Status badges removed to clean up UI -->
          </div>

          <!-- Quest Description -->
          <p class="text-gray-400 mb-4 text-sm">{{ quest.description }}</p>

          <!-- Quest Rewards -->
          <div class="mb-4 bg-dark-900/50 rounded p-3">
            <div class="text-sm text-gray-400 mb-2">Rewards:</div>
            <div class="flex gap-4 text-sm">
              <span class="text-yellow-400">💰 {{ quest.reward_currency }} Dakari</span>
              <span class="text-purple-400">✨ {{ quest.reward_experience }} XP</span>
            </div>
          </div>

          <!-- Quest Actions -->
          <div class="flex gap-2">
            <!-- Not started -->
            <button
              v-if="!isQuestActive(quest.id) && !isQuestCompleted(quest.id) && !isQuestFailed(quest.id)"
              @click="acceptQuest(quest.id)"
              class="btn btn-primary flex-1"
              :disabled="!authStore.isAuthenticated"
            >
              Accept Quest
            </button>
            <!-- Active (in progress) - minigame modal will handle completion -->
            <button
              v-else-if="isQuestActive(quest.id)"
              disabled
              class="flex-1 py-3 px-6 bg-blue-600 text-white font-bold rounded-lg cursor-not-allowed opacity-75"
            >
              🎮 Minigame In Progress
            </button>
            <!-- Completed -->
            <button
              v-else-if="isQuestCompleted(quest.id)"
              disabled
              class="flex-1 py-3 px-6 bg-green-600 text-white font-bold rounded-lg cursor-not-allowed opacity-75"
            >
              ✓ Quest Completed
            </button>
            <!-- Failed -->
            <button
              v-else-if="isQuestFailed(quest.id)"
              disabled
              class="flex-1 py-3 px-6 bg-red-600 text-white font-bold rounded-lg cursor-not-allowed opacity-75"
            >
              ✗ Quest Failed
            </button>
          </div>

          <!-- Quest Countdown -->
          <div v-if="quest.expires_at && countdowns[quest.id]" class="mt-3 text-xs">
            <span :class="countdowns[quest.id] === 'Expired' ? 'text-red-400' : 'text-yellow-400'">
              ⏰ {{ countdowns[quest.id] === 'Expired' ? 'Expired' : `Resets in ${countdowns[quest.id]}` }}
            </span>
          </div>
        </div>
      </div>

      <!-- No Quests State -->
      <div v-else-if="!traveling" class="text-center py-12">
        <div class="text-6xl mb-4">📜</div>
        <h3 class="text-2xl font-bold mb-2">No Active Quests</h3>
        <p class="text-gray-400">Check back later for new quests!</p>
      </div>
    </main>

    <!-- Minigame Modal -->
    <QuestMinigame
      v-if="showMinigame && selectedQuest && activeChallenge"
      :quest="selectedQuest"
      :challenge="activeChallenge"
      :onComplete="handleMinigameComplete"
      :onFail="handleMinigameFail"
      :onClose="closeMinigame"
    />
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
