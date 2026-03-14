<template>
  <div class="minigame-container">
    <div class="minigame-header">
      <h3 class="text-2xl font-bold text-center mb-2">🧠 Memory Challenge</h3>
      <p class="text-gray-400 text-center mb-4">Memorize the emoji sequence!</p>
    </div>

    <div class="challenge-content">
      <!-- Phase 1: Showing sequence -->
      <div v-if="phase === 'memorize'" class="memorization-phase">
        <div class="sequence-display text-4xl sm:text-7xl text-center mb-6 font-mono tracking-widest">
          {{ challenge.sequence.join(' ') }}
        </div>
        <div class="timer text-center">
          <span class="text-lg text-yellow-400">
            📖 Memorize in {{ memorizationTime }}s
          </span>
        </div>
        <div class="text-center text-sm text-gray-500 mt-4">
          {{ getDifficultyHint() }}
        </div>
      </div>

      <!-- Phase 2: Recalling sequence -->
      <div v-else-if="phase === 'recall'" class="recall-phase">
        <div class="timer text-center mb-4">
          <span class="text-lg" :class="timeRemaining <= 5 ? 'text-red-500 animate-pulse' : 'text-gray-300'">
            ⏱️ {{ timeRemaining }}s remaining
          </span>
        </div>

        <div class="instructions text-center mb-6">
          <p class="text-gray-300 mb-2">Type the sequence you saw:</p>
          <p class="text-sm text-gray-500">{{ getInputHint() }}</p>
        </div>

        <div class="answer-input">
          <input
            v-model="userAnswer"
            @keyup.enter="submitAnswer"
            @paste.prevent
            @copy.prevent
            @cut.prevent
            type="text"
            placeholder="Type without spaces..."
            class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white text-center text-xl sm:text-3xl font-mono tracking-widest focus:outline-none focus:border-yellow-500"
            :disabled="isSubmitting"
            ref="answerInput"
            autocomplete="off"
            spellcheck="false"
          />
        </div>

        <button
          @click="submitAnswer"
          :disabled="!userAnswer.trim() || isSubmitting"
          class="w-full mt-4 py-3 px-6 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
        >
          {{ isSubmitting ? 'Submitting...' : 'Submit Answer' }}
        </button>
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

const phase = ref('memorize')
const memorizationTime = ref(props.challenge.memorizeTime || 5)
const timeRemaining = ref(props.challenge.timeLimit)
const userAnswer = ref('')
const isSubmitting = ref(false)
const answerInput = ref(null)
let memorizationTimer = null
let recallTimer = null

function getDifficultyHint() {
  const difficulty = props.challenge.difficulty || 'medium'
  if (difficulty === 'easy') {
    return 'Only lowercase letters - 4 characters'
  } else if (difficulty === 'hard') {
    return 'Mixed case letters and numbers - 6 characters'
  } else {
    return 'Lowercase letters and numbers - 5 characters'
  }
}

function getInputHint() {
  const difficulty = props.challenge.difficulty || 'medium'
  if (difficulty === 'hard') {
    return 'Case-sensitive! Type exactly as shown (no spaces)'
  } else {
    return 'Type the characters in order (no spaces)'
  }
}

function submitAnswer() {
  if (!userAnswer.value.trim() || isSubmitting.value) return

  isSubmitting.value = true
  clearInterval(recallTimer)

  // Remove all spaces and compare
  const cleanedAnswer = userAnswer.value.replace(/\s/g, '')
  const correctAnswer = props.challenge.answer

  emit('submit', {
    answer: cleanedAnswer,
    correctAnswer: correctAnswer
  })
}

function startMemorization() {
  // Count down memorization time
  memorizationTimer = setInterval(() => {
    memorizationTime.value--

    if (memorizationTime.value <= 0) {
      clearInterval(memorizationTimer)
      startRecall()
    }
  }, 1000)
}

function startRecall() {
  phase.value = 'recall'

  // Auto-focus input
  setTimeout(() => {
    answerInput.value?.focus()
  }, 100)

  // Count down recall time
  recallTimer = setInterval(() => {
    timeRemaining.value--

    if (timeRemaining.value <= 0) {
      clearInterval(recallTimer)
      emit('timeout')
    }
  }, 1000)
}

onMounted(() => {
  startMemorization()
})

onUnmounted(() => {
  if (memorizationTimer) clearInterval(memorizationTimer)
  if (recallTimer) clearInterval(recallTimer)
})
</script>

<style scoped>
.minigame-container {
  padding: 1.5rem;
}

.sequence-display {
  letter-spacing: 0.2em;
  text-shadow: 0 0 20px rgba(234, 179, 8, 0.5);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
}
</style>
