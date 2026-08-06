import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' keeps every asset path relative, so the same build works on
// GitHub Pages under /staffing-hub/ and when opened locally.
// outDir 'docs' because GitHub Pages serves main branch /docs — the build
// is committed, no Actions workflow and no secrets needed (same philosophy
// as the live timetable repo: generated output lives in the repo).
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'docs',
    emptyOutDir: true
  }
})
