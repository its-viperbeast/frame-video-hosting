import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    port: 5173,
  },
  build: {
    // The Video.js skin is the whole app; splitting it would not shrink what a video page loads.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      onLog(level, log, handler) {
        // react-compiler-runtime's "use no memo" only steers the React Compiler; dropping it when bundled is harmless.
        if (log.code === 'MODULE_LEVEL_DIRECTIVE') return
        handler(level, log)
      },
    },
  },
})
