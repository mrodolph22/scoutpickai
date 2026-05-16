import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        // NOTE: Do NOT expose API keys to the client bundle.
        // GEMINI_API_KEY should only be used on a secure backend.
        // Removed: 'process.env.API_KEY' and 'process.env.GEMINI_API_KEY'
        // See: https://github.com/mrodolph22/scoutpickai/security
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
