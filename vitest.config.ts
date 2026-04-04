import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/encode.test.ts'],
  },
});
