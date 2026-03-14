<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-dark-900 via-dark-800 to-purple-900">
    <div class="max-w-2xl mx-auto px-4 text-center">
      <!-- Icon -->
      <div class="text-8xl mb-8 animate-bounce">🚀</div>

      <!-- Title -->
      <h1 class="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
        Web Dashboard Coming Soon!
      </h1>

      <!-- Message -->
      <p class="text-base sm:text-xl text-gray-300 mb-8">
        The QuestCord web dashboard is currently in testing mode.
        <br />
        We'll be launching publicly soon!
      </p>

      <!-- Countdown -->
      <div class="text-gray-400 mb-8">
        Redirecting you to home in <span class="text-primary font-bold">{{ countdown }}</span> seconds...
      </div>

      <!-- Progress Bar -->
      <div class="w-full bg-dark-700 rounded-full h-2 mb-8 overflow-hidden">
        <div
          class="h-full bg-gradient-to-r from-primary to-purple-500 transition-all duration-1000"
          :style="{ width: progress + '%' }"
        ></div>
      </div>

      <!-- Manual Redirect Button -->
      <button
        @click="redirectNow"
        class="px-8 py-3 bg-primary hover:bg-primary-dark text-white font-bold rounded-lg transition-colors"
      >
        Go to Home Now
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const countdown = ref(30)
const progress = ref(0)
let interval = null

function redirectNow() {
  if (interval) clearInterval(interval)
  window.location.href = '/'
}

onMounted(() => {
  interval = setInterval(() => {
    countdown.value--
    progress.value = ((30 - countdown.value) / 30) * 100

    if (countdown.value <= 0) {
      clearInterval(interval)
      redirectNow()
    }
  }, 1000)
})

onUnmounted(() => {
  if (interval) clearInterval(interval)
})
</script>

<style scoped>
/* Additional styles if needed */
</style>
