<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useUserStore } from '../stores/user'

const route = useRoute()
const authStore = useAuthStore()
const userStore = useUserStore()

const isEditing = ref(false)
const editBio = ref('')
const editBanner = ref('')
const editVanityUrl = ref('')

const userId = computed(() => {
  return route.params.userId || authStore.user?.discordId
})

const isOwnProfile = computed(() => {
  return authStore.user && authStore.user.discordId === userId.value
})

const levelProgress = computed(() => {
  if (!userStore.profileData) return { current: 0, required: 100, percentage: 0 }
  return userStore.calculateLevelProgress(
    userStore.profileData.experience,
    userStore.profileData.level
  )
})

const avatarUrl = computed(() => {
  if (!userStore.profileData?.discord_id) return `https://cdn.discordapp.com/embed/avatars/0.png`

  // If user has custom avatar, use it
  if (userStore.profileData.avatar_hash) {
    return `https://cdn.discordapp.com/avatars/${userStore.profileData.discord_id}/${userStore.profileData.avatar_hash}.png?size=128`
  }

  // Otherwise use Discord default avatar (numbered 0-5)
  const defaultAvatar = parseInt(userStore.profileData.discord_id) % 6
  return `https://cdn.discordapp.com/embed/avatars/${defaultAvatar}.png`
})

const memberSince = computed(() => {
  if (!userStore.profileData?.created_at) return 'Unknown'

  // Check if created_at is a Unix timestamp (number) or a date string
  const timestamp = typeof userStore.profileData.created_at === 'number'
    ? userStore.profileData.created_at * 1000  // Convert Unix seconds to milliseconds
    : userStore.profileData.created_at

  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
})

onMounted(async () => {
  if (userId.value) {
    await userStore.fetchProfile(userId.value)

    // Only populate edit fields if it's the user's own profile
    if (userStore.profileData && isOwnProfile.value) {
      editBio.value = userStore.profileData.profile_bio || ''
      editBanner.value = userStore.profileData.profile_banner || ''
      editVanityUrl.value = userStore.profileData.vanity_url || ''
    }
  }
})

function startEditing() {
  // SECURITY: Only allow editing own profile
  if (!isOwnProfile.value) {
    console.error('Cannot edit another user\'s profile')
    return
  }
  isEditing.value = true
}

async function saveProfile() {
  // SECURITY: Only allow saving own profile
  if (!userId.value || !isOwnProfile.value) {
    console.error('Cannot save another user\'s profile')
    return
  }

  const success = await userStore.updateProfile(userId.value, {
    profile_bio: editBio.value,
    profile_banner: editBanner.value,
    vanity_url: editVanityUrl.value || null
  })

  if (success) {
    isEditing.value = false
  }
}

function cancelEditing() {
  editBio.value = userStore.profileData?.profile_bio || ''
  editBanner.value = userStore.profileData?.profile_banner || ''
  editVanityUrl.value = userStore.profileData?.vanity_url || ''
  isEditing.value = false
}

function formatNumber(num) {
  if (num === null || num === undefined) return '0'

  const absNum = Math.abs(num)

  if (absNum >= 1e15) return (num / 1e15).toFixed(1).replace(/\.0$/, '') + 'Q'
  if (absNum >= 1e12) return (num / 1e12).toFixed(1).replace(/\.0$/, '') + 'T'
  if (absNum >= 1e9) return (num / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'
  if (absNum >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
  if (absNum >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'

  return num.toString()
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
          <router-link to="/guilds" class="btn btn-secondary">Guilds</router-link>
          <button v-if="authStore.isAuthenticated" @click="authStore.logout()" class="btn btn-secondary" style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); border: none;">Logout</button>
          <button v-else @click="authStore.login()" class="btn btn-secondary" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); border: none;">Login</button>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <main class="container mx-auto px-4 py-8 flex-1">
      <!-- Loading State -->
      <div v-if="userStore.loading" class="text-center py-12">
        <div class="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto"></div>
        <p class="mt-4 text-gray-400">Loading profile...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="userStore.error" class="text-center py-12">
        <div class="text-red-500 text-xl mb-4">Error loading profile</div>
        <p class="text-gray-400">{{ userStore.error }}</p>
      </div>

      <!-- Profile Content -->
      <div v-else-if="userStore.profileData" class="max-w-4xl mx-auto">
        <!-- Profile Banner -->
        <div
          class="h-32 md:h-48 rounded-t-lg bg-gradient-to-r from-primary/20 to-secondary/20 relative overflow-hidden"
          :style="userStore.profileData.profile_banner ? `background-image: url(${userStore.profileData.profile_banner}); background-size: cover; background-position: center;` : ''"
        >
          <div class="absolute inset-0 bg-gradient-to-b from-transparent to-dark-900/50"></div>
        </div>

        <!-- Profile Header -->
        <div class="bg-dark-800 rounded-b-lg shadow-lg p-4 md:p-8 -mt-16 relative z-10">
          <div class="flex flex-col md:flex-row items-center md:items-end gap-6">
            <!-- Avatar -->
            <div class="relative">
              <img
                :src="avatarUrl"
                :alt="userStore.profileData.username"
                class="w-32 h-32 rounded-full border-4 border-dark-800 shadow-xl"
                @error="$event.target.src = '/images/default-avatar.png'"
              />
              <div class="absolute -bottom-2 -right-2 bg-primary text-white font-bold px-3 py-1 rounded-full shadow-lg">
                Lv {{ userStore.profileData.level }}
              </div>
            </div>

            <!-- User Info -->
            <div class="flex-1 text-center md:text-left">
              <h1 class="text-3xl font-bold text-white mb-2 flex items-center gap-2 justify-center md:justify-start">
                <span v-if="userStore.profileData.verified" class="verified-badge" title="Verified User">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-7 h-7">
                    <path fill-rule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clip-rule="evenodd" />
                  </svg>
                </span>
                <span>{{ userStore.profileData.username }}</span>
              </h1>

              <!-- Guild Tag -->
              <div v-if="userStore.profileData.guild" class="mb-2 flex items-center gap-2 justify-center md:justify-start">
                <span class="text-sm text-gray-400">🏰</span>
                <router-link :to="`/guilds`" class="text-lg font-semibold text-primary hover:text-primary/80 transition-colors">
                  [{{ userStore.profileData.guild.tag }}] {{ userStore.profileData.guild.name }}
                </router-link>
                <span class="text-xs text-gray-500 px-2 py-1 bg-dark-700 rounded">
                  Lv {{ userStore.profileData.guild.level }}
                </span>
              </div>

              <!-- Bio -->
              <p v-if="!isEditing && userStore.profileData.profile_bio" class="text-gray-400 mb-4">
                {{ userStore.profileData.profile_bio }}
              </p>
              <p v-else-if="!isEditing" class="text-gray-500 italic mb-4">
                No bio set
              </p>

              <!-- Experience Bar -->
              <div class="mb-4">
                <div class="flex justify-between text-sm mb-1">
                  <span class="text-gray-400">Experience</span>
                  <span class="text-gray-400">
                    {{ formatNumber(levelProgress.current) }} / {{ formatNumber(levelProgress.required) }} XP
                  </span>
                </div>
                <div class="w-full bg-dark-700 rounded-full h-3 overflow-hidden">
                  <div
                    class="bg-gradient-to-r from-primary to-secondary h-full transition-all duration-500 rounded-full"
                    :style="{ width: levelProgress.percentage + '%' }"
                  ></div>
                </div>
              </div>

              <!-- Edit Button -->
              <button
                v-if="isOwnProfile && !isEditing"
                @click="startEditing"
                class="btn btn-primary"
              >
                Edit Profile
              </button>
            </div>

            <!-- Currency Display -->
            <div class="flex flex-wrap gap-4 justify-center md:justify-start">
              <div class="bg-dark-700 px-6 py-3 rounded-lg text-center">
                <div class="text-2xl font-bold text-yellow-400">{{ formatNumber(userStore.profileData.currency) }}</div>
                <div class="text-xs text-gray-400">Dakari</div>
              </div>
              <div class="bg-dark-700 px-6 py-3 rounded-lg text-center">
                <div class="text-2xl font-bold text-purple-400">{{ formatNumber(userStore.profileData.gems) }}</div>
                <div class="text-xs text-gray-400">Gems</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Edit Profile Form -->
        <div v-if="isEditing" class="bg-dark-800 rounded-lg shadow-lg p-8 mt-6">
          <h2 class="text-2xl font-bold mb-6">Edit Profile</h2>

          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">Bio</label>
              <textarea
                v-model="editBio"
                class="input w-full h-24 resize-none"
                placeholder="Tell us about yourself..."
                maxlength="200"
              ></textarea>
              <div class="text-xs text-gray-500 mt-1">{{ editBio.length }} / 200</div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">Banner URL</label>
              <input
                v-model="editBanner"
                type="url"
                class="input w-full"
                placeholder="https://example.com/banner.jpg"
              />
              <div class="text-xs text-gray-500 mt-1">Image URL for your profile banner</div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">Vanity URL</label>
              <div class="flex items-center gap-2">
                <span class="text-gray-400">questcord.fun/profile/</span>
                <input
                  v-model="editVanityUrl"
                  type="text"
                  class="input flex-1"
                  placeholder="your-custom-url"
                  pattern="[a-zA-Z0-9_-]{3,30}"
                  maxlength="30"
                />
              </div>
              <div class="text-xs text-gray-500 mt-1">
                3-30 characters (letters, numbers, underscores, hyphens). Leave empty to use Discord ID.
              </div>
            </div>

            <div class="flex gap-3 pt-4">
              <button @click="saveProfile" class="btn btn-primary" :disabled="userStore.loading">
                {{ userStore.loading ? 'Saving...' : 'Save Changes' }}
              </button>
              <button @click="cancelEditing" class="btn btn-secondary">
                Cancel
              </button>
            </div>

            <div v-if="userStore.error" class="text-red-500 text-sm">
              {{ userStore.error }}
            </div>
          </div>
        </div>

        <!-- Stats Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
          <!-- Total Experience -->
          <div class="card-hover">
            <div class="text-gray-400 text-sm mb-2">Total Experience</div>
            <div class="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              {{ formatNumber(userStore.profileData.total_experience) }}
            </div>
          </div>

          <!-- Quests Completed -->
          <div class="card-hover">
            <div class="text-gray-400 text-sm mb-2">Quests Completed</div>
            <div class="text-3xl font-bold text-green-400">
              {{ formatNumber(userStore.profileData.quests_completed) }}
            </div>
          </div>

          <!-- Bosses Defeated -->
          <div class="card-hover">
            <div class="text-gray-400 text-sm mb-2">Bosses Defeated</div>
            <div class="text-3xl font-bold text-red-400">
              {{ formatNumber(userStore.profileData.bosses_defeated) }}
            </div>
          </div>

          <!-- Items Owned -->
          <div class="card-hover">
            <div class="text-gray-400 text-sm mb-2">Items Owned</div>
            <div class="text-3xl font-bold text-blue-400">
              {{ formatNumber(userStore.profileData.inventoryCount) }}
            </div>
          </div>
        </div>

        <!-- Additional Info -->
        <div class="bg-dark-800 rounded-lg shadow-lg p-8 mt-8">
          <h2 class="text-2xl font-bold mb-6">Additional Information</h2>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="flex justify-between items-center py-3 border-b border-dark-700">
              <span class="text-gray-400">Current Location</span>
              <span class="font-semibold">{{ userStore.profileData.current_location || 'Spawn Town' }}</span>
            </div>

            <div class="flex justify-between items-center py-3 border-b border-dark-700">
              <span class="text-gray-400">Traveling</span>
              <span :class="userStore.profileData.traveling ? 'text-yellow-400' : 'text-gray-500'">
                {{ userStore.profileData.traveling ? 'Yes' : 'No' }}
              </span>
            </div>

            <div v-if="userStore.profileData.traveling" class="flex justify-between items-center py-3 border-b border-dark-700">
              <span class="text-gray-400">Destination</span>
              <span class="font-semibold">{{ userStore.profileData.travel_destination }}</span>
            </div>

            <div class="flex justify-between items-center py-3 border-b border-dark-700">
              <span class="text-gray-400">Member Since</span>
              <span class="font-semibold">{{ memberSince }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- No Profile Found -->
      <div v-else class="text-center py-12">
        <div class="text-xl text-gray-400">Profile not found</div>
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

.verified-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #3b82f6;
  animation: verified-pulse 2s ease-in-out infinite;
  filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.6));
}

@keyframes verified-pulse {
  0%, 100% {
    transform: scale(1);
    filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.6));
  }
  50% {
    transform: scale(1.1);
    filter: drop-shadow(0 0 12px rgba(59, 130, 246, 0.9));
  }
}

.verified-badge:hover {
  animation: verified-spin 0.6s ease-in-out;
  filter: drop-shadow(0 0 16px rgba(59, 130, 246, 1));
}

@keyframes verified-spin {
  0% {
    transform: rotate(0deg) scale(1);
  }
  50% {
    transform: rotate(180deg) scale(1.2);
  }
  100% {
    transform: rotate(360deg) scale(1);
  }
}
</style>
