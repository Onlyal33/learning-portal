import baseConfig from './jest.config.js';

export default {
  ...baseConfig,
  testMatch: ['**/*.integration.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/\\.build/'],
  transform: {
    '\\.[jt]s?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
        useESM: true,
        diagnostics: { ignoreCodes: [151002] },
      },
    ],
  },
};
