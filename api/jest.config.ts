// jest.config.ts //yarn add --dev jest ts-jest @types/jest typescript
export default {
    preset: 'ts-jest',
    testEnvironment: 'node',
    collectCoverage: true,
    collectCoverageFrom: [
        "src/**/*.{ts,tsx}",
        "!src/**/*.d.ts",
        "!src/**/__tests__/**", // исключить сами тесты
        "!src/**/__mocks__/**", // и моки
    ],
    testMatch: ['**/__tests__/**/*.test.ts'],
    moduleFileExtensions: ['ts', 'js', 'json'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^axios$': '<rootDir>/src/__tests__/__mocks__/axios.ts',
        '^axios-cookiejar-support$': '<rootDir>/src/__tests__/__mocks__/axios-cookiejar-support.ts',
    }
};