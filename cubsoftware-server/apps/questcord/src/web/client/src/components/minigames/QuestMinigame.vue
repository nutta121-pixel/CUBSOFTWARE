<template>
  <div class="minigame-modal-overlay" @click.self="closeModal">
    <div class="minigame-modal">
      <!-- Close button -->
      <button
        @click="closeModal"
        class="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors z-10"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>

      <!-- Quest info -->
      <div class="quest-info text-center mb-6">
        <h2 class="text-2xl font-bold text-white mb-2">{{ quest.quest_name }}</h2>
        <p class="text-gray-400 text-sm">{{ quest.description }}</p>
      </div>

      <!-- Result display -->
      <div v-if="showResult" class="result-display">
        <div v-if="result === 'success'" class="success-result">
          <div class="text-center">
            <div class="text-6xl mb-4 animate-bounce">✅</div>
            <h3 class="text-3xl font-bold text-green-400 mb-2">Success!</h3>
            <p class="text-xl text-gray-200 font-semibold mb-4">Quest Completed</p>
            <p class="text-gray-300 mb-4">You successfully completed the challenge!</p>

            <div class="rewards bg-gradient-to-br from-green-900/30 to-blue-900/30 rounded-lg p-4 mb-6 border border-green-500/30">
              <p class="text-lg font-semibold text-white mb-3">Rewards Earned:</p>
              <div class="flex flex-wrap justify-center gap-4">
                <div>
                  <p class="text-yellow-400 font-bold text-lg">+{{ scaledRewards.currency }} Dakari</p>
                </div>
                <div>
                  <p class="text-purple-400 font-bold text-lg">+{{ scaledRewards.gems }} Gems</p>
                </div>
                <div>
                  <p class="text-blue-400 font-bold text-lg">+{{ scaledRewards.xp }} XP</p>
                </div>
              </div>
            </div>

            <button
              @click="closeModal"
              class="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors"
            >
              Awesome!
            </button>
          </div>
        </div>

        <div v-else class="failure-result">
          <div class="text-center">
            <div class="text-6xl mb-4">❌</div>
            <h3 class="text-3xl font-bold text-red-400 mb-2">You Failed!</h3>
            <p class="text-xl text-gray-200 font-semibold mb-4">Quest Failed</p>
            <p class="text-gray-300 mb-6">{{ failureMessage }}</p>

            <div class="bg-gray-800/50 rounded-lg p-4 mb-6 border border-red-500/30">
              <p class="text-sm text-gray-400">
                This quest cannot be retried today. Try other quests or come back tomorrow!
              </p>
            </div>

            <button
              @click="closeModal"
              class="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg transition-colors"
            >
              Try Another Quest
            </button>
          </div>
        </div>
      </div>

      <!-- Minigame component -->
      <div v-else class="minigame-wrapper">
        <component
          :is="currentMinigame"
          :challenge="challenge"
          @submit="handleSubmit"
          @timeout="handleTimeout"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import WordScramble from './WordScramble.vue'
import MathChallenge from './MathChallenge.vue'
import TriviaChallenge from './TriviaChallenge.vue'
import ReactionTest from './ReactionTest.vue'
import MemoryGame from './MemoryGame.vue'

const props = defineProps({
  quest: {
    type: Object,
    required: true
  },
  challenge: {
    type: Object,
    required: true
  },
  onComplete: {
    type: Function,
    required: true
  },
  onFail: {
    type: Function,
    required: true
  },
  onClose: {
    type: Function,
    required: true
  }
})

const showResult = ref(false)
const result = ref(null)
const failureMessage = ref('')
const scaledRewards = ref({
  currency: 0,
  gems: 0,
  xp: 0
})

const currentMinigame = computed(() => {
  const type = props.challenge.type

  switch (type) {
    case 'word_scramble':
      return WordScramble
    case 'math':
      return MathChallenge
    case 'trivia':
      return TriviaChallenge
    case 'reaction':
      return ReactionTest
    case 'memory':
      return MemoryGame
    default:
      return WordScramble
  }
})

async function handleSubmit(data) {
  let isCorrect = false

  // Check if answer is correct based on challenge type
  if (props.challenge.type === 'reaction') {
    // Reaction test always succeeds if submitted
    isCorrect = data.success
  } else if (props.challenge.type === 'trivia') {
    // Trivia has custom validation
    isCorrect = data.isCorrect
  } else {
    // Word scramble, math, memory
    isCorrect = data.answer === data.correctAnswer
  }

  if (isCorrect) {
    // Call onComplete to submit to API
    const response = await props.onComplete(props.quest.id, data)

    if (response && response.success) {
      result.value = 'success'
      scaledRewards.value = response.rewards || {
        currency: props.quest.reward_currency,
        gems: props.quest.reward_gems,
        xp: 50
      }
      showResult.value = true
    } else {
      result.value = 'failure'
      failureMessage.value = response?.message || 'Failed to complete quest. Please try again.'
      showResult.value = true
    }
  } else {
    result.value = 'failure'
    failureMessage.value = 'Incorrect answer! The quest has been marked as failed.'
    showResult.value = true
    await props.onFail(props.quest.id)
  }
}

async function handleTimeout() {
  result.value = 'failure'
  failureMessage.value = "Time's up! You didn't complete the challenge in time."
  showResult.value = true
  await props.onFail(props.quest.id)
}

function closeModal() {
  props.onClose()
}
</script>

<style scoped>
.minigame-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease-out;
}

.minigame-modal {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 1rem;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  padding: 2rem;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  position: relative;
  animation: slideUp 0.3s ease-out;
}

.quest-info {
  border-bottom: 2px solid #2d3748;
  padding-bottom: 1rem;
}

.result-display {
  padding: 2rem 0;
}

.rewards {
  border: 2px solid #4a5568;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideUp {
  from {
    transform: translateY(50px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* Custom scrollbar */
.minigame-modal::-webkit-scrollbar {
  width: 8px;
}

.minigame-modal::-webkit-scrollbar-track {
  background: #1a1a2e;
}

.minigame-modal::-webkit-scrollbar-thumb {
  background: #4a5568;
  border-radius: 4px;
}

.minigame-modal::-webkit-scrollbar-thumb:hover {
  background: #718096;
}
</style>
