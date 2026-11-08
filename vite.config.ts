import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Modo demo (npm run build:demo): la app corre sin servidor, con una base simulada en
  // el navegador y rutas relativas, para publicarla dentro de un artifact.
  const demo = mode === "demo";
  return {
    base: demo ? "./" : "/",
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [react()],
    resolve: {
      alias: [
        ...(demo
          ? [
              { find: "@/integrations/supabase/client", replacement: path.resolve(__dirname, "./src/demo/demoClient.ts") },
            ]
          : []),
        { find: "@", replacement: path.resolve(__dirname, "./src") },
      ],
    },
    build: demo ? { outDir: "dist-demo", emptyOutDir: true } : undefined,
  };
});
