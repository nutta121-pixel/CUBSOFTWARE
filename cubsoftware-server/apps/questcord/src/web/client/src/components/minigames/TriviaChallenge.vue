<template>
  <div class="minigame-container">
    <div class="minigame-header">
      <h3 class="text-2xl font-bold text-center mb-2">❓ Trivia Challenge</h3>
      <p class="text-gray-400 text-center mb-4">Answer the question correctly!</p>
    </div>

    <div class="challenge-content">
      <div class="question text-xl font-semibold text-center mb-6 text-purple-400 px-4">
        {{ getQuestion() }}
      </div>

      <div class="timer text-center mb-4">
        <span class="text-lg" :class="timeRemaining <= 5 ? 'text-red-500 animate-pulse' : 'text-gray-300'">
          ⏱️ {{ timeRemaining }}s remaining
        </span>
      </div>

      <div class="text-center text-sm text-gray-500 mb-4">
        Answer the question about QuestCord
      </div>

      <div class="answer-input">
        <input
          v-model="userAnswer"
          @keyup.enter="submitAnswer"
          @paste.prevent
          @copy.prevent
          @cut.prevent
          type="text"
          placeholder="Type your answer here..."
          class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white text-center text-xl focus:outline-none focus:border-purple-500"
          :disabled="isSubmitting"
          ref="answerInput"
          autocomplete="off"
        />
      </div>

      <button
        @click="submitAnswer"
        :disabled="!userAnswer.trim() || isSubmitting"
        class="w-full mt-4 py-3 px-6 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
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

function getQuestion() {
  // Extract just the question from the description (before "You have X seconds...")
  const desc = props.challenge.description || ''
  const questionPart = desc.split('\n\n')[0]
  return questionPart || 'Answer the trivia question'
}

function submitAnswer() {
  if (!userAnswer.value.trim() || isSubmitting.value) return

  isSubmitting.value = true
  clearInterval(timer)

  const answer = userAnswer.value.toLowerCase().trim()
  const isCorrect = answer === props.challenge.answer ||
    (props.challenge.alternatives && props.challenge.alternatives.includes(answer))

  emit('submit', {
    answer: userAnswer.value.toLowerCase().trim(),
    correctAnswer: props.challenge.answer,
    isCorrect
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

.question {
  line-height: 1.6;
}
</style>
