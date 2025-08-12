import { defineConfig } from "vite";
import { redwood } from "rwsdk/vite";

export default defineConfig({
  plugins: [redwood()],
  resolve: {
    conditions: ["react-server", "browser", "import", "default"]
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development")
  },
  build: {
    sourcemap: true, // Enable source maps for production debugging
    rollupOptions: {
      external: [
        '@prisma/client/runtime/query_engine_bg.sqlite.wasm',
        /.*\.wasm$/,
        /.*query_compiler_bg\.wasm$/
      ],
      output: {
        // Bundle size optimization and monitoring
        manualChunks: {
          // Separate vendor chunks for better caching
          vendor: ['react', 'react-dom'],
          sentry: ['@sentry/cloudflare'],
          ai: ['openai']
        }
      }
    },
    // Performance budgets to prevent code bloat
    // These limits help maintain fast loading times on Cloudflare Edge
    chunkSizeWarningLimit: 500, // 500KB warning threshold for individual chunks
    target: 'esnext', // Modern target for optimal bundle size
    // CSS code splitting for better performance
    cssCodeSplit: true,
    // Asset optimization
    assetsInlineLimit: 4096, // Inline assets smaller than 4KB as base64
    // Minification for production
    minify: 'esbuild',
    // Additional bundle analysis
    reportCompressedSize: true
  },
  // Bundle analyzer configuration for monitoring
  esbuild: {
    // Remove console.log in production builds
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
    // Optimize for size and performance
    legalComments: 'none'
  }
});
