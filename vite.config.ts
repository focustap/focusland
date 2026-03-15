// Vite configuration for the React frontend.
// This file tells Vite how to build and serve the app.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173
  }
});
