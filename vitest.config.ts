import { defineConfig } from 'vitest/config';

// Tests automatiques : npm test
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/preparation.ts'],
    environment: 'node',
    testTimeout: 20000, // le hachage des mots de passe est volontairement lent
  },
});
