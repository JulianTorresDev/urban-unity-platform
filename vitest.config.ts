import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.ts", "supabase/functions/**/*.test.ts"],
    // Cada archivo de base de datos arranca su propio Postgres en WebAssembly;
    // en serie se evita agotar la memoria del proceso de pruebas
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/components/**", "src/hooks/**", "supabase/functions/_shared/**"],
      exclude: ["src/components/ui/**", "**/*.test.*"],
    },
  },
});
