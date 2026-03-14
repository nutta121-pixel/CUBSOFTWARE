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
          <div class="text-5xl">🏰</div>
          <h2 class="text-4xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
            Guilds
          </h2>
        </div>
        <p class="text-gray-400 text-lg mb-6">Join forces with other players</p>

        <!-- Server Selector -->
        <div class="flex items-center justify-center gap-4 max-w-2xl mx-auto mb-6">
          <label class="text-sm text-gray-400">Server:</label>
          <select
            v-model="selectedServer"
            @change="loadGuilds"
            class="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-4 py-2 text-white hover:border-primary transition-colors"
          >
            <option v-for="server in userServers" :key="server.id" :value="server.id">
              {{ server.name }}
            </option>
          </select>
        </div>
      </div>

      <!-- My Guild Section -->
      <div v-if="myGuild" class="mb-8">
        <div class="card">
          <div class="flex justify-between items-start mb-4">
            <div>
              <h3 class="text-2xl font-bold text-primary mb-1">{{ myGuild.name }} [{{ myGuild.tag }}]</h3>
              <p class="text-gray-400">{{ myGuild.description }}</p>
            </div>
            <button @click="showLeaveConfirm = true" class="btn" style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); border: none;">
              Leave Guild
            </button>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 md:gap-4 mb-6">
            <div class="bg-dark-900 rounded-lg p-4 text-center">
              <div class="text-sm text-gray-400 mb-1">Level</div>
              <div class="text-2xl font-bold text-primary">{{ myGuild.level }}</div>
              <div class="text-xs text-gray-500">+{{ myGuild.level * 5 }}% bonus</div>
            </div>
            <div class="bg-dark-900 rounded-lg p-4 text-center">
              <div class="text-sm text-gray-400 mb-1">Global Rank</div>
              <div v-if="myGuildRank !== null" class="text-2xl font-bold text-yellow-400">
                <span v-if="myGuildRank === 1">🥇</span>
                <span v-else-if="myGuildRank === 2">🥈</span>
                <span v-else-if="myGuildRank === 3">🥉</span>
                <span v-else>#{{ myGuildRank }}</span>
              </div>
              <div v-else class="text-2xl font-bold text-gray-500">-</div>
            </div>
            <div class="bg-dark-900 rounded-lg p-4 text-center">
              <div class="text-sm text-gray-400 mb-1">Members</div>
              <div class="text-2xl font-bold text-secondary">{{ myGuild.memberCount }}/{{ myGuild.max_members }}</div>
            </div>
            <div class="bg-dark-900 rounded-lg p-4 text-center">
              <div class="text-sm text-gray-400 mb-1">Treasury</div>
              <div class="text-lg font-bold text-warning">💰 {{ myGuild.treasury_currency.toLocaleString() }}</div>
            </div>
            <div class="bg-dark-900 rounded-lg p-4 text-center">
              <div class="text-sm text-gray-400 mb-1">Gems</div>
              <div class="text-lg font-bold text-success">💎 {{ myGuild.treasury_gems.toLocaleString() }}</div>
            </div>
          </div>

          <!-- Upgrades Section (Leader Only) -->
          <div v-if="myGuild.userRole === 'leader'" class="bg-dark-900 rounded-lg p-4 mb-6">
            <h4 class="text-lg font-bold mb-4">🌟 Guild Upgrades (Leader Only)</h4>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Upgrade Member Slots -->
              <div class="bg-dark-800 rounded-lg p-4 border border-dark-600">
                <div class="flex justify-between items-start mb-3">
                  <div>
                    <h5 class="font-bold text-primary">Member Slots</h5>
                    <p class="text-sm text-gray-400">Current: {{ myGuild.memberCount }}/{{ myGuild.max_members }}</p>
                  </div>
                  <div class="text-2xl">👥</div>
                </div>
                <div class="mb-3">
                  <div class="text-sm text-gray-400">Cost: 💎 1,000 Gems</div>
                  <div class="text-sm text-success">+5 member slots</div>
                </div>
                <button @click="upgradeSlots" :disabled="upgrading" class="btn btn-primary w-full">
                  {{ upgrading ? 'Upgrading...' : 'Upgrade Slots' }}
                </button>
              </div>

              <!-- Upgrade Guild Level -->
              <div class="bg-dark-800 rounded-lg p-4 border border-dark-600">
                <div class="flex justify-between items-start mb-3">
                  <div>
                    <h5 class="font-bold text-primary">Guild Level</h5>
                    <p class="text-sm text-gray-400">Current: Level {{ myGuild.level }} (+{{ myGuild.level * 5 }}% bonus)</p>
                  </div>
                  <div class="text-2xl">⭐</div>
                </div>
                <div class="mb-3">
                  <div class="text-sm text-gray-400">Cost: 💎 {{ (myGuild.level * 1000).toLocaleString() }} Gems</div>
                  <div class="text-sm text-success">+5% bonus to stats & rewards</div>
                </div>
                <button @click="upgradeLevel" :disabled="upgrading" class="btn btn-primary w-full">
                  {{ upgrading ? 'Upgrading...' : 'Upgrade Level' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Contribute Section -->
          <div class="bg-dark-900 rounded-lg p-4 mb-6">
            <h4 class="text-lg font-bold mb-4">Contribute to Treasury</h4>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-sm text-gray-400 mb-2">Dakari</label>
                <input v-model.number="contributeCurrency" type="number" min="0" class="input w-full" placeholder="0">
              </div>
              <div>
                <label class="block text-sm text-gray-400 mb-2">Gems</label>
                <input v-model.number="contributeGems" type="number" min="0" class="input w-full" placeholder="0">
              </div>
              <div class="flex items-end">
                <button @click="contribute" :disabled="contributing" class="btn btn-primary w-full">
                  {{ contributing ? 'Contributing...' : 'Contribute' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Members List -->
          <div>
            <h4 class="text-lg font-bold mb-4">Members ({{ myGuild.memberCount }})</h4>
            <div class="space-y-2">
              <div v-for="member in myGuild.members" :key="member.user_id" class="bg-dark-900 rounded-lg p-3 flex justify-between items-center">
                <div class="flex items-center gap-3">
                  <span v-if="member.role === 'leader'" class="text-2xl">👑</span>
                  <span v-else-if="member.role === 'officer'" class="text-2xl">⭐</span>
                  <span v-else class="text-2xl">👤</span>
                  <div>
                    <div class="font-bold">{{ member.username }}</div>
                    <div class="text-xs text-gray-400 capitalize">{{ member.role }}</div>
                  </div>
                </div>
                <div class="text-right text-sm">
                  <div class="text-warning">💰 {{ member.contribution_currency.toLocaleString() }}</div>
                  <div class="text-success">💎 {{ member.contribution_gems.toLocaleString() }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Pending Invites -->
      <div v-if="authStore.isAuthenticated && pendingInvites.length > 0" class="mb-8">
        <div class="card">
          <h3 class="text-2xl font-bold text-primary mb-4">📨 Pending Invites</h3>
          <div class="space-y-3">
            <div v-for="invite in pendingInvites" :key="invite.id" class="bg-dark-900 rounded-lg p-4 flex justify-between items-center">
              <div>
                <div class="font-bold text-lg">{{ invite.guild_name }}</div>
                <div class="text-sm text-gray-400">Invited by {{ invite.inviter_name }}</div>
              </div>
              <button @click="joinGuild(invite.id)" class="btn btn-primary">
                Accept Invite
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Create Guild Button -->
      <div v-if="authStore.isAuthenticated && !myGuild" class="mb-8 text-center">
        <button @click="showCreateModal = true" class="btn btn-primary text-lg px-8 py-3">
          🏰 Create Guild (100,000 Dakari)
        </button>
      </div>

      <!-- Guild Leaderboards -->
      <div class="mb-8">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-2xl font-bold">🏆 Guild Leaderboards</h3>
          <select v-model="leaderboardCategory" @change="loadLeaderboard" class="bg-dark-800 border border-dark-600 rounded-lg px-4 py-2 text-white">
            <option value="level">By Level</option>
            <option value="treasury">By Treasury</option>
            <option value="members">By Members</option>
          </select>
        </div>

        <div v-if="loadingLeaderboard" class="text-center py-8">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        </div>

        <div v-else-if="leaderboardGuilds.length === 0" class="card text-center py-8">
          <div class="text-4xl mb-3">🏆</div>
          <p class="text-gray-400">No guilds on the leaderboard yet</p>
        </div>

        <div v-else class="space-y-3">
          <div v-for="(guild, index) in leaderboardGuilds" :key="guild.id" class="card hover:border-primary transition-colors">
            <div class="flex items-center gap-4">
              <!-- Rank -->
              <div class="text-3xl font-bold flex-shrink-0 w-12 text-center">
                <span v-if="index === 0" class="text-yellow-400">🥇</span>
                <span v-else-if="index === 1" class="text-gray-300">🥈</span>
                <span v-else-if="index === 2" class="text-amber-600">🥉</span>
                <span v-else class="text-gray-500">{{ index + 1 }}</span>
              </div>

              <!-- Guild Info -->
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-xl">{{ guild.public ? '🔓' : '🔒' }}</span>
                  <h4 class="text-lg font-bold">[{{ guild.tag }}] {{ guild.name }}</h4>
                </div>
                <p class="text-sm text-gray-400">Leader: {{ guild.leader_name }}</p>
              </div>

              <!-- Stats -->
              <div class="text-right">
                <template v-if="leaderboardCategory === 'level'">
                  <div class="text-2xl font-bold text-primary">Level {{ guild.level }}</div>
                  <div class="text-sm text-gray-400">+{{ guild.level * 5 }}% bonus</div>
                  <div class="text-xs text-gray-500">{{ guild.member_count }}/{{ guild.max_members }} members</div>
                </template>
                <template v-else-if="leaderboardCategory === 'treasury'">
                  <div class="text-lg font-bold text-warning">💰 {{ formatNumber(guild.treasury_currency) }}</div>
                  <div class="text-lg font-bold text-success">💎 {{ guild.treasury_gems.toLocaleString() }}</div>
                  <div class="text-xs text-gray-500">Level {{ guild.level }}</div>
                </template>
                <template v-else>
                  <div class="text-2xl font-bold text-secondary">{{ guild.member_count }}/{{ guild.max_members }}</div>
                  <div class="text-sm text-gray-400">members</div>
                  <div class="text-xs text-gray-500">Level {{ guild.level }}</div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- All Guilds List -->
      <div class="mb-8">
        <h3 class="text-2xl font-bold mb-4">All Guilds in {{ currentServerName }}</h3>

        <div v-if="loading" class="text-center py-12">
          <div class="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto"></div>
          <p class="mt-4 text-gray-400">Loading guilds...</p>
        </div>

        <div v-else-if="guilds.length === 0" class="text-center py-12 bg-dark-800 rounded-lg">
          <div class="text-6xl mb-4">🏰</div>
          <h3 class="text-2xl font-bold mb-2">No Guilds Yet</h3>
          <p class="text-gray-400">Be the first to create a guild in this server!</p>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div v-for="guild in guilds" :key="guild.id" class="card hover:border-primary transition-colors">
            <div class="flex justify-between items-start mb-3">
              <div class="flex items-center gap-2">
                <div>
                  <div class="flex items-center gap-2 mb-1">
                    <h4 class="text-xl font-bold">[{{ guild.tag }}] {{ guild.name }}</h4>
                    <span v-if="guild.public" class="text-lg" title="Public - Anyone can join">🔓</span>
                    <span v-else class="text-lg" title="Invite-Only">🔒</span>
                  </div>
                  <p class="text-sm text-gray-400">Leader: {{ guild.leaderName }}</p>
                </div>
              </div>
              <div class="text-right">
                <div class="text-sm text-gray-400">Level</div>
                <div class="text-2xl font-bold text-primary">{{ guild.level }}</div>
              </div>
            </div>

            <p class="text-gray-400 text-sm mb-4">{{ guild.description || 'No description' }}</p>

            <div class="grid grid-cols-2 gap-3 mb-4">
              <div class="bg-dark-900 rounded p-2 text-center">
                <div class="text-xs text-gray-400">Members</div>
                <div class="font-bold">{{ guild.memberCount }}/{{ guild.max_members }}</div>
              </div>
              <div class="bg-dark-900 rounded p-2 text-center">
                <div class="text-xs text-gray-400">Treasury</div>
                <div class="font-bold text-warning">💰 {{ formatNumber(guild.treasury_currency) }}</div>
              </div>
            </div>

            <div v-if="myGuild?.id === guild.id" class="text-center text-primary font-bold">
              ✓ Your Guild
            </div>
            <button v-else-if="authStore.isAuthenticated && guild.public && !myGuild"
                    @click="joinPublicGuild(guild.id)"
                    class="btn btn-primary w-full">
              🔓 Join Guild
            </button>
            <button v-else @click="viewGuildDetails(guild)" class="btn btn-secondary w-full">
              View Details
            </button>
          </div>
        </div>
      </div>
    </main>

    <!-- Create Guild Modal -->
    <div v-if="showCreateModal" class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" @click.self="showCreateModal = false">
      <div class="bg-dark-800 rounded-lg p-8 max-w-md w-full border border-primary">
        <h3 class="text-2xl font-bold mb-6 text-primary">🏰 Create Guild</h3>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Guild Name *</label>
            <input v-model="newGuild.name" type="text" class="input w-full" placeholder="Epic Warriors" maxlength="32">
            <div class="text-xs text-gray-500 mt-1">3-32 characters</div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Guild Tag *</label>
            <input v-model="newGuild.tag" type="text" class="input w-full" placeholder="EPIC" maxlength="5" @input="newGuild.tag = newGuild.tag.toUpperCase()">
            <div class="text-xs text-gray-500 mt-1">2-5 characters</div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Description</label>
            <textarea v-model="newGuild.description" class="input w-full h-24 resize-none" placeholder="Join the best guild in QuestCord..."></textarea>
          </div>

          <div>
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="newGuild.isPublic" type="checkbox" class="w-5 h-5">
              <span class="text-sm font-medium text-gray-300">
                <span v-if="newGuild.isPublic">🔓 Public</span>
                <span v-else>🔒 Invite-Only</span>
              </span>
            </label>
            <div class="text-xs text-gray-500 mt-1">
              {{ newGuild.isPublic ? 'Anyone can join without an invite' : 'Requires an invite to join' }}
            </div>
          </div>

          <div class="bg-warning/20 border border-warning rounded p-3 text-sm">
            <div class="font-bold text-warning mb-1">Cost: 100,000 Dakari</div>
            <div class="text-gray-400">This amount will be deducted from your balance</div>
          </div>

          <div class="flex gap-3 pt-4">
            <button @click="createGuild" :disabled="creating" class="btn btn-primary flex-1">
              {{ creating ? 'Creating...' : 'Create Guild' }}
            </button>
            <button @click="showCreateModal = false" class="btn btn-secondary">
              Cancel
            </button>
          </div>

          <div v-if="createError" class="text-red-500 text-sm">
            {{ createError }}
          </div>
        </div>
      </div>
    </div>

    <!-- Leave Confirmation Modal -->
    <div v-if="showLeaveConfirm" class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" @click.self="showLeaveConfirm = false">
      <div class="bg-dark-800 rounded-lg p-8 max-w-md w-full border border-error">
        <h3 class="text-2xl font-bold mb-4 text-error">⚠️ Leave Guild?</h3>
        <p class="text-gray-300 mb-6">Are you sure you want to leave {{ myGuild?.name }}? You will lose access to the guild treasury and all member benefits.</p>

        <div class="flex gap-3">
          <button @click="leaveGuild" class="btn flex-1" style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); border: none;">
            Yes, Leave Guild
          </button>
          <button @click="showLeaveConfirm = false" class="btn btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import axios from 'axios'

const authStore = useAuthStore()
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://cubsoftware.site'

const loading = ref(true)
const guilds = ref([])
const myGuild = ref(null)
const pendingInvites = ref([])
const selectedServer = ref(null)
const userServers = ref([])

const showCreateModal = ref(false)
const showLeaveConfirm = ref(false)
const creating = ref(false)
const contributing = ref(false)
const upgrading = ref(false)
const createError = ref('')

const newGuild = ref({
  name: '',
  tag: '',
  description: '',
  isPublic: true
})

const contributeCurrency = ref(0)
const contributeGems = ref(0)

const leaderboardCategory = ref('level')
const leaderboardGuilds = ref([])
const loadingLeaderboard = ref(false)
const myGuildRank = ref(null)

const currentServerName = computed(() => {
  return userServers.value.find(s => s.id === selectedServer.value)?.name || 'Unknown'
})

onMounted(async () => {
  await fetchUserServers()
  if (userServers.value.length > 0) {
    selectedServer.value = userServers.value[0].id
    await loadGuilds()
  }
  await loadLeaderboard()
})

async function fetchUserServers() {
  try {
    if (!authStore.isAuthenticated) {
      userServers.value = [{ id: '1284593395188367502', name: 'CUB SOFTWARE' }]
      return
    }

    const response = await axios.get(`${API_BASE}/api/v1/users/me/servers`, {
      headers: { Authorization: `Bearer ${authStore.token}` }
    })

    if (response.data.success && response.data.data.length > 0) {
      userServers.value = response.data.data
    } else {
      userServers.value = [{ id: '1284593395188367502', name: 'CUB SOFTWARE' }]
    }
  } catch (err) {
    console.error('Error fetching servers:', err)
    userServers.value = [{ id: '1284593395188367502', name: 'CUB SOFTWARE' }]
  }
}

async function loadGuilds() {
  loading.value = true
  try {
    // Load all guilds
    const guildsResponse = await axios.get(`${API_BASE}/api/v1/guilds?serverId=${selectedServer.value}`)
    guilds.value = guildsResponse.data.data || []

    // Load user's guild if authenticated
    if (authStore.isAuthenticated) {
      const myGuildResponse = await axios.get(`${API_BASE}/api/v1/guilds/me`, {
        headers: { Authorization: `Bearer ${authStore.token}` }
      })
      myGuild.value = myGuildResponse.data.data

      // Load guild rank if user has a guild
      if (myGuild.value) {
        try {
          const rankResponse = await axios.get(`${API_BASE}/api/v1/guilds/${myGuild.value.id}/rank`)
          myGuildRank.value = rankResponse.data.data.rank
        } catch (err) {
          console.error('Error loading guild rank:', err)
          myGuildRank.value = null
        }
      }

      // Load pending invites
      const invitesResponse = await axios.get(`${API_BASE}/api/v1/guilds/invites`, {
        headers: { Authorization: `Bearer ${authStore.token}` }
      })
      pendingInvites.value = invitesResponse.data.data || []
    }
  } catch (err) {
    console.error('Error loading guilds:', err)
  } finally {
    loading.value = false
  }
}

async function createGuild() {
  if (!newGuild.value.name || !newGuild.value.tag) {
    createError.value = 'Please fill in all required fields'
    return
  }

  creating.value = true
  createError.value = ''

  try {
    const response = await axios.post(`${API_BASE}/api/v1/guilds`, {
      name: newGuild.value.name,
      tag: newGuild.value.tag,
      description: newGuild.value.description,
      serverId: selectedServer.value,
      isPublic: newGuild.value.isPublic
    }, {
      headers: { Authorization: `Bearer ${authStore.token}` }
    })

    if (response.data.success) {
      showCreateModal.value = false
      newGuild.value = { name: '', tag: '', description: '', isPublic: true }
      await loadGuilds()
      alert('✅ Guild created successfully!')
    }
  } catch (err) {
    createError.value = err.response?.data?.error || 'Failed to create guild'
  } finally {
    creating.value = false
  }
}

async function contribute() {
  if (contributeCurrency.value === 0 && contributeGems.value === 0) {
    alert('Please enter an amount to contribute')
    return
  }

  contributing.value = true

  try {
    const response = await axios.post(`${API_BASE}/api/v1/guilds/contribute`, {
      currency: contributeCurrency.value,
      gems: contributeGems.value
    }, {
      headers: { Authorization: `Bearer ${authStore.token}` }
    })

    if (response.data.success) {
      contributeCurrency.value = 0
      contributeGems.value = 0
      await loadGuilds()
      alert('✅ Contribution successful!')
    }
  } catch (err) {
    alert(err.response?.data?.error || 'Failed to contribute')
  } finally {
    contributing.value = false
  }
}

async function joinGuild(inviteId) {
  try {
    const response = await axios.post(`${API_BASE}/api/v1/guilds/join`, {
      inviteId
    }, {
      headers: { Authorization: `Bearer ${authStore.token}` }
    })

    if (response.data.success) {
      await loadGuilds()
      alert('✅ Successfully joined guild!')
    }
  } catch (err) {
    alert(err.response?.data?.error || 'Failed to join guild')
  }
}

async function joinPublicGuild(guildId) {
  try {
    const response = await axios.post(`${API_BASE}/api/v1/guilds/${guildId}/join-public`, {}, {
      headers: { Authorization: `Bearer ${authStore.token}` }
    })

    if (response.data.success) {
      await loadGuilds()
      alert('✅ Successfully joined guild!')
    }
  } catch (err) {
    alert(err.response?.data?.error || 'Failed to join guild')
  }
}

async function leaveGuild() {
  try {
    const response = await axios.post(`${API_BASE}/api/v1/guilds/leave`, {}, {
      headers: { Authorization: `Bearer ${authStore.token}` }
    })

    if (response.data.success) {
      showLeaveConfirm.value = false
      await loadGuilds()
      alert('You have left the guild')
    }
  } catch (err) {
    alert(err.response?.data?.error || 'Failed to leave guild')
  }
}

async function upgradeSlots() {
  if (!confirm('Upgrade member slots for 1,000 gems from guild treasury?')) {
    return
  }

  upgrading.value = true

  try {
    const response = await axios.post(`${API_BASE}/api/v1/guilds/upgrade/slots`, {}, {
      headers: { Authorization: `Bearer ${authStore.token}` }
    })

    if (response.data.success) {
      await loadGuilds()
      alert(`✅ ${response.data.message}`)
    }
  } catch (err) {
    alert(err.response?.data?.error || 'Failed to upgrade slots')
  } finally {
    upgrading.value = false
  }
}

async function upgradeLevel() {
  const cost = myGuild.value.level * 1000
  if (!confirm(`Upgrade guild to Level ${myGuild.value.level + 1} for ${cost.toLocaleString()} gems from guild treasury?`)) {
    return
  }

  upgrading.value = true

  try {
    const response = await axios.post(`${API_BASE}/api/v1/guilds/upgrade/level`, {}, {
      headers: { Authorization: `Bearer ${authStore.token}` }
    })

    if (response.data.success) {
      await loadGuilds()
      alert(`✅ ${response.data.message}`)
    }
  } catch (err) {
    alert(err.response?.data?.error || 'Failed to upgrade level')
  } finally {
    upgrading.value = false
  }
}

function viewGuildDetails(guild) {
  // TODO: Implement guild details view
  alert(`Guild Details: ${guild.name}\n\nThis feature will be enhanced in a future update!`)
}

async function loadLeaderboard() {
  loadingLeaderboard.value = true
  try {
    const response = await axios.get(`${API_BASE}/api/v1/guilds/leaderboard?category=${leaderboardCategory.value}&limit=10`)
    if (response.data.success) {
      leaderboardGuilds.value = response.data.data.guilds
    }
  } catch (err) {
    console.error('Error loading leaderboard:', err)
  } finally {
    loadingLeaderboard.value = false
  }
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toString()
}
</script>

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
