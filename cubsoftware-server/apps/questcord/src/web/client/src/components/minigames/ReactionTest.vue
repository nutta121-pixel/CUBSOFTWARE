<template>
  <div class="minigame-container">
    <div class="minigame-header">
      <h3 class="text-2xl font-bold text-center mb-2">⚡ Reaction Test</h3>
      <p class="text-gray-400 text-center mb-4">Click the button when it turns GREEN!</p>
    </div>

    <div class="challenge-content">
      <div class="reaction-zone">
        <div v-if="!isReady" class="waiting-message text-center text-xl text-gray-400 mb-8">
          <p class="mb-2">The button will change color shortly...</p>
          <p class="text-sm text-gray-500">Stay focused!</p>
        </div>

        <div v-else class="ready-message text-center text-2xl text-green-400 font-bold mb-8 animate-pulse">
          CLICK NOW! ⚡
        </div>

        <div class="flex justify-center">
          <button
            @click="handleClick"
            :disabled="!isReady || hasClicked"
            :class="{
              'bg-gray-600': !isReady,
              'bg-green-500 hover:bg-green-600 scale-110 shadow-lg shadow-green-500/50': isReady,
              'cursor-not-allowed': hasClicked
            }"
            class="w-36 h-36 sm:w-48 sm:h-48 rounded-full text-white font-bold text-lg sm:text-xl transition-all duration-300 disabled:cursor-not-allowed"
          >
            {{ isReady ? 'CLICK NOW!' : 'Wait...' }}
          </button>
        </div>

        <div v-if="reactionTime" class="reaction-time text-center mt-6">
          <p class="text-2xl font-bold text-yellow-400">{{ reactionTime }}ms</p>
          <p class="text-sm text-gray-400">Reaction time</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  challenge: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['submit', 'timeout'])

const isReady = ref(false)
const hasClicked = ref(false)
const reactionTime = ref(null)
let readyTime = 0
let delayTimer = null
let timeoutTimer = null

function handleClick() {
  if (!isReady.value || hasClicked.value) return

  hasClicked.value = true
  const clickTime = Date.now()
  reactionTime.value = clickTime - readyTime

  // Clear timeout timer
  if (timeoutTimer) clearTimeout(timeoutTimer)

  // Submit success
  setTimeout(() => {
    emit('submit', {
      success: true,
      reactionTime: reactionTime.value
    })
  }, 1000)
}

function startChallenge() {
  // Wait for the delay, then turn button green
  delayTimer = setTimeout(() => {
    isReady.value = true
    readyTime = Date.now()

    // Set timeout for failure
    timeoutTimer = setTimeout(() => {
      if (!hasClicked.value) {
        emit('timeout')
      }
    }, props.challenge.timeLimit * 1000)
  }, props.challenge.delay)
}

onMounted(() => {
  startChallenge()
})

onUnmounted(() => {
  if (delayTimer) clearTimeout(delayTimer)
  if (timeoutTimer) clearTimeout(timeoutTimer)
})
</script>

<style scoped>
.minigame-container {
  padding: 1.5rem;
}

.reaction-zone {
  min-height: 300px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
</style>
