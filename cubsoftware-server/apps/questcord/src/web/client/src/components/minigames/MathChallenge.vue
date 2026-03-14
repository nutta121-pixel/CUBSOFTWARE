<template>
  <div class="minigame-container">
    <div class="minigame-header">
      <h3 class="text-2xl font-bold text-center mb-2">🔢 Math Challenge</h3>
      <p class="text-gray-400 text-center mb-4">Solve the equation!</p>
    </div>

    <div class="challenge-content">
      <div class="equation text-2xl sm:text-4xl font-bold text-center mb-6 text-green-400">
        {{ challenge.equation }} = ?
      </div>

      <div class="timer text-center mb-4">
        <span class="text-lg" :class="timeRemaining <= 5 ? 'text-red-500 animate-pulse' : 'text-gray-300'">
          ⏱️ {{ timeRemaining }}s remaining
        </span>
      </div>

      <div class="answer-input">
        <input
          v-model="userAnswer"
          @keyup.enter="submitAnswer"
          @paste.prevent
          @copy.prevent
          @cut.prevent
          type="number"
          placeholder="Type your answer here..."
          class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white text-center text-xl focus:outline-none focus:border-green-500"
          :disabled="isSubmitting"
          ref="answerInput"
          autocomplete="off"
        />
      </div>

      <button
        @click="submitAnswer"
        :disabled="!userAnswer || isSubmitting"
        class="w-full mt-4 py-3 px-6 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
      >
        {{ isSubmitting ? 'Submitting...' : 'Submit Answer' }}
      </button>
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

const userAnswer = ref('')
const timeRemaining = ref(props.challenge.timeLimit)
const isSubmitting = ref(false)
const answerInput = ref(null)
let timer = null

function submitAnswer() {
  if (!userAnswer.value || isSubmitting.value) return

  isSubmitting.value = true
  clearInterval(timer)

  emit('submit', {
    answer: userAnswer.value.toString().trim(),
    correctAnswer: props.challenge.answer
  })
}

function startTimer() {
  timer = setInterval(() => {
    timeRemaining.value--

    if (timeRemaining.value <= 0) {
      clearInterval(timer)
      emit('timeout')
    }
  }, 1000)
}

onMounted(() => {
  startTimer()
  // Auto-focus input
  setTimeout(() => {
    answerInput.value?.focus()
  }, 100)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.minigame-container {
  padding: 1.5rem;
}

.equation {
  letter-spacing: 0.1em;
  text-shadow: 0 0 10px rgba(34, 197, 94, 0.5);
}

/* Hide number input arrows */
input[type="number"]::-webkit-inner-spin-button,
input[type="number"]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

input[type="number"] {
  -moz-appearance: textfield;
}
</style>
