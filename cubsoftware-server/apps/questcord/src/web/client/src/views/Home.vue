<template>
  <div>
    <!-- Cosmic Particles Effect -->
    <div class="cosmic-particles"></div>

    <!-- Header with Cross-Site Navigation -->
    <header class="site-header">
      <div class="header-top">
        <a href="https://cubsoftware.site" class="logo">
          <span class="logo-text">
            <span class="cub">CUB</span><span class="software">SOFTWARE</span>
          </span>
        </a>
        <nav class="site-nav">
          <a href="/" class="active">Home</a>
          <a href="#about">About</a>
          <router-link to="/dashboard">Dashboard</router-link>
          <a href="https://cubsoftware.site" target="_blank">CubSoftware</a>
        </nav>
      </div>
    </header>

    <div class="hero">
      <div class="container">
        <div class="hero-title-container">
          <img src="https://cubsoftware.site/images/compass.png" alt="Compass" class="hero-icon" onerror="this.style.display='none'">
          <h1 class="hero-title">QuestCord</h1>
        </div>
        <p class="hero-subtitle">Quest across the Discord universe</p>
        <p class="hero-description">Complete quests, defeat bosses, and climb the global leaderboard in this immersive Discord RPG experience</p>
        <div class="hero-buttons">
          <button v-if="!authStore.isAuthenticated" @click="authStore.login()" class="btn btn-primary">
            Login with Discord
          </button>
          <router-link v-else to="/dashboard" class="btn btn-primary">
            Dashboard
          </router-link>
          <a href="#about" class="btn btn-secondary">Learn More</a>
        </div>
      </div>
    </div>

    <div class="stats-section">
      <div class="container">
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">{{ stats.servers }}</div>
            <div class="stat-label">Servers</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ stats.users }}</div>
            <div class="stat-label">Users</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ stats.currency }}</div>
            <div class="stat-label">Dakari in Circulation</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ stats.gems }}</div>
            <div class="stat-label">Gems in Circulation</div>
          </div>
        </div>
      </div>
    </div>

    <div id="about" class="about-section">
      <div class="container">
        <div class="content-with-image">
          <div class="content-text">
            <h2 class="section-title">What is QuestCord?</h2>
            <p class="section-description">QuestCord transforms Discord servers into a virtual world where you can complete quests, battle bosses, and earn rewards. Each server becomes a unique location with daily rotating quests.</p>

            <div class="features-grid">
              <div class="feature-card">
                <h3>Daily Quests</h3>
                <p>Complete 5 unique quests per server each day. Travel between servers to continue your adventure.</p>
              </div>
              <div class="feature-card">
                <h3>Boss Battles</h3>
                <p>Bosses randomly spawn across servers. Team up with other players to defeat them and earn massive rewards.</p>
              </div>
              <div class="feature-card">
                <h3>Global Leaderboard</h3>
                <p>Compete with players worldwide. Top 3 players each month receive exclusive rewards.</p>
              </div>
              <div class="feature-card">
                <h3>Economy System</h3>
                <p>Earn Dakari and gems from quests and bosses. Use them to purchase rare items and upgrades.</p>
              </div>
            </div>
          </div>
          <div class="content-image">
            <img src="https://cubsoftware.site/images/compass.png" alt="Quest Example" onerror="this.src='https://via.placeholder.com/500x600/7c3aed/ffffff?text=Quest+System'">
          </div>
        </div>
      </div>
    </div>

    <div class="activity-section">
      <div class="container">
        <div class="content-with-image reverse">
          <div class="content-image">
            <img src="https://cubsoftware.site/images/notification.png" alt="Live Activity" onerror="this.src='https://via.placeholder.com/500x600/5865f2/ffffff?text=Live+Activity'">
          </div>
          <div class="content-text">
            <h2 class="section-title">Live Activity</h2>
            <p class="section-description">See what's happening across the QuestCord universe in real-time. Watch as players complete quests, defeat bosses, and climb the ranks!</p>
            <div class="activity-container" id="activity-feed">
              <div v-if="loadingActivity" class="activity-item">Loading activity...</div>
              <div v-else-if="activities.length === 0" class="activity-item">No recent activity</div>
              <div v-else>
                <div v-for="activity in activities" :key="activity.id" class="activity-item">
                  {{ activity.message }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="leaderboard-section">
      <div class="container">
        <div class="content-with-image">
          <div class="content-text">
            <h2 class="section-title">Global Leaderboard</h2>
            <p class="section-description">Compete with players from around the world! Top 3 players each month receive exclusive rewards and eternal glory.</p>
            <div class="leaderboard-container">
              <div v-if="topPlayers.length === 0" class="empty-state">
                No rankings yet. Be the first to compete!
              </div>
              <div v-else class="leaderboard-top-three">
                <div
                  v-for="(player, index) in topPlayers.slice(0, 3)"
                  :key="player.id"
                  :class="['leaderboard-item', `rank-${index + 1}`]"
                >
                  <div class="rank-badge">
                    {{ index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉' }}
                  </div>
                  <div class="player-info">
                    <div class="player-name">{{ player.username }}</div>
                    <div class="player-score">{{ player.score?.toLocaleString() || 0 }} pts</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="content-image">
            <img src="https://cubsoftware.site/images/leaderboard.png" alt="Leaderboard" onerror="this.src='https://via.placeholder.com/500x600/fbbf24/000000?text=Leaderboard'">
          </div>
        </div>
      </div>
    </div>

    <div class="faq-section">
      <div class="container">
        <h2 class="section-title">Frequently Asked Questions</h2>
        <div class="faq-grid">
          <div class="faq-item">
            <h3>How do I get started?</h3>
            <p>Add QuestCord to your Discord server, then use /tutorial to learn the basics. Start with /quests to see available quests.</p>
          </div>
          <div class="faq-item">
            <h3>When do quests reset?</h3>
            <p>Quests rotate daily at midnight NZ time. Each server gets 5 unique quests per day.</p>
          </div>
          <div class="faq-item">
            <h3>How do boss spawns work?</h3>
            <p>Bosses spawn randomly in opted-in servers. Only one boss can be active at a time, and it stays for 60 minutes or until defeated.</p>
          </div>
          <div class="faq-item">
            <h3>What are the leaderboard rewards?</h3>
            <p>Top 3 players each month receive Dakari and gems. The leaderboard resets on the 1st of each month.</p>
          </div>
          <div class="faq-item">
            <h3>Can I opt out of the quest system?</h3>
            <p>Yes, server owners can use /optout to disable quests in their server. You can re-enable it anytime with /optin.</p>
          </div>
          <div class="faq-item">
            <h3>How do I earn Dakari and gems?</h3>
            <p>Complete quests and defeat bosses to earn rewards. Higher difficulty quests and bosses give better rewards.</p>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import axios from 'axios'

const authStore = useAuthStore()

const stats = ref({
  servers: '0',
  users: '0',
  questsCompleted: '0',
  currency: '0',
  gems: '0'
})

const activities = ref([])
const loadingActivity = ref(true)
const topPlayers = ref([])

onMounted(async () => {
  // Load stats from API
  try {
    const response = await axios.get('/api/stats')
    if (response.data) {
      stats.value = {
        servers: response.data.total_servers?.toLocaleString() || '0',
        users: response.data.total_users?.toLocaleString() || '0',
        questsCompleted: response.data.total_quests_completed?.toLocaleString() || '0',
        currency: response.data.total_currency_formatted || '0',
        gems: response.data.total_gems_formatted || '0'
      }
    }
  } catch (error) {
    console.error('Error loading stats:', error)
  }

  // Load activity (placeholder - needs API endpoint)
  setTimeout(() => {
    loadingActivity.value = false
  }, 1000)

  // Load top players (placeholder - needs API endpoint)
  try {
    const response = await axios.get('/api/leaderboard/top')
    if (response.data && response.data.players) {
      topPlayers.value = response.data.players
    }
  } catch (error) {
    console.error('Error loading leaderboard:', error)
  }
})
</script>

<style scoped>
/* Import the existing CSS styles */
@import url('https://cubsoftware.site/css/style.css');
</style>
