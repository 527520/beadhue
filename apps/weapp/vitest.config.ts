import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({ resolve: { alias: { '@beadhue/core': path.resolve(__dirname,'../../packages/core'), '@': path.resolve(__dirname,'../../src') } }, test: { environment:'node',include:['src/**/*.test.ts'],maxWorkers:1 } });
