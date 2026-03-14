import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './assets/main.css'
import axios from 'axios'

// Setup axios interceptor for handling whitelist errors
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    // Check if error is 403 (Forbidden - not whitelisted)
    if (error.response?.status === 403 &&
        error.response?.data?.message?.includes('testing mode')) {
      // Redirect to coming soon page
      router.push('/coming-soon')
      return Promise.reject(error)
    }
    return Promise.reject(error)
  }
)

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
