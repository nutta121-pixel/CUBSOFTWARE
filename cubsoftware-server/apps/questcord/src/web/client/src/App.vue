<template>
  <div class="app-wrapper">
    <!-- Cosmic Particles Effect (matches main page) -->
    <div class="cosmic-particles"></div>

    <!-- Aurora Effect (matches main page) -->
    <div class="aurora-effect"></div>

    <div id="app" class="min-h-screen text-white">
      <router-view />
    </div>

    <!-- Shared Footer -->
    <footer class="footer">
      <div class="container">
        <div class="footer-content">
          <div class="footer-text">
            &copy; 2026 CUB SOFTWARE. Made with love by
            <a href="https://discord.com/users/378501056008683530" target="_blank" rel="noopener noreferrer" class="footer-link">CUB</a>
          </div>
          <div class="footer-legal-links">
            <a href="https://cubsoftware.site" class="footer-legal-link">Home</a>
            <span class="footer-separator">|</span>
            <a href="https://cubsoftware.site/status" class="footer-legal-link">Status</a>
            <span class="footer-separator">|</span>
            <a href="https://cubsoftware.site/terms" class="footer-legal-link">Terms</a>
            <span class="footer-separator">|</span>
            <a href="https://cubsoftware.site/privacy" class="footer-legal-link">Privacy</a>
            <span class="footer-separator">|</span>
            <a href="https://cubsoftware.site/copyright" class="footer-legal-link">Copyright</a>
            <span class="footer-separator">|</span>
            <a href="https://cubsoftware.site/report" class="footer-legal-link">Report Issue</a>
            <span class="footer-separator">|</span>
            <a href="https://cubsoftware.site/contact" class="footer-legal-link">Contact</a>
          </div>
        </div>
      </div>
    </footer>

    <!-- CUB SOFTWARE Mascot - desktop only -->
    <img
      src="https://cubsoftware.site/static/images/CUB/CUBSOFTWARE%20MASCOT%20-%20TRANSPARENT%20BACKGROUND%202.png"
      class="site-mascot"
      alt=""
      draggable="false"
    >
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useAuthStore } from './stores/auth'

const authStore = useAuthStore()

onMounted(() => {
  // Check authentication status on app load
  authStore.checkAuth()
})
</script>

<style>
/* Vue-specific styles only - main styles loaded from /css/style.css */
.app-wrapper {
  position: relative;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

#app {
  position: relative;
  z-index: 10;
  flex: 1;
}

/* Ensure all content is above background effects */
body > * {
  position: relative;
  z-index: 1;
}

/* Mascot - desktop only */
.site-mascot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 800px;
  height: auto;
  pointer-events: none;
  user-select: none;
  filter: drop-shadow(0 0 32px rgba(88, 101, 242, 0.35));
  z-index: 0;
}

@media (max-width: 1024px) {
  .site-mascot {
    display: none;
  }
}
</style>
