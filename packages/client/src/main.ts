import { createApp } from 'vue';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import App from './App.vue';
import router from './plugins/router';
import { tryRestoreSession } from '@/lib/restore-session';
import './assets/main.css';

async function bootstrap(): Promise<void> {
  const app = createApp(App);

  // Pinia must be installed before tryRestoreSession runs (it reads the
  // auth store via useAuthStore()).
  app.use(createPinia());

  // Restore the session BEFORE wiring the router so the router guard sees
  // the correct `isAuthenticated` on the very first navigation.
  await tryRestoreSession();

  app.use(router);
  app.use(PrimeVue);

  app.mount('#app');
}

void bootstrap();
