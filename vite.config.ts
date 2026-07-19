import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
              priority: 30,
              includeDependenciesRecursively: false,
            },
            {
              name: "flow-vendor",
              test: /node_modules[\\/]@xyflow[\\/]/,
              priority: 20,
              includeDependenciesRecursively: false,
            },
            {
              name: "game-core",
              test: /src[\\/]game[\\/](?:content|engine|recipeGraph|statistics)\.ts$/,
              priority: 10,
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4318,
  },
});
