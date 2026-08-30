import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Cel z brief'u to Lighthouse >= 85 na mobile. Ostrzeżenie ustawione niżej
    // niż domyślne 500 kB, żeby regresja wagi bundla była widoczna od razu
    // w logu builda, a nie dopiero w audycie.
    chunkSizeWarningLimit: 400,
  },
});
