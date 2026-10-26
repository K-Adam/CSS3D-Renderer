import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/C3RRenderer.ts",
      formats: ["es"],
      fileName: "c3r-three",
    },
    minify: false,
    rolldownOptions: { external: [/^three($|\/)/, "c3r"] },
  },
});
