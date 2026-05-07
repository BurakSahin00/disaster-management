import type { Config } from 'jest'
import nextJest from 'next/jest'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^leaflet$': '<rootDir>/__mocks__/leaflet.ts',
    '^react-leaflet$': '<rootDir>/__mocks__/react-leaflet.tsx',
  },
}

export default createJestConfig(config)
