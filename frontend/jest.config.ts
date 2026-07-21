import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^react-leaflet$': '<rootDir>/__mocks__/react-leaflet.ts',
    '^leaflet$': '<rootDir>/__mocks__/leaflet.ts',
  },
}

export default createJestConfig(config)
