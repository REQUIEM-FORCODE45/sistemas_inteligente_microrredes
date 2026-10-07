import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // plotly.js-dist-min (UMD) rompe el build de produccion si entra por el
      // bundler; se carga como script global y aqui solo exponemos window.Plotly.
      "plotly.js-dist-min": path.resolve(__dirname, "./src/lib/plotly-global.js"),
    },
  },
  optimizeDeps: {
    include: ['recharts', 'react-is'],
  },
})
