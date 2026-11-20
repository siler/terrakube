export default {
  testEnvironment: "jsdom",
  // The scripts/ tests run under `node --test` (api-types:test), not Jest.
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/scripts/"],
  transform: {
    "^.+\\.ts?$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
    "^.+\\.jsx?$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
  transformIgnorePatterns: [
    "/node_modules/(?!(@ant-design|html-react-parser|html-dom-parser|domhandler|domutils|dom-serializer|domelementtype|entities)/)",
  ],
  moduleNameMapper: {
    "\\.(css|less|sass|scss)$": "identity-obj-proxy",
    "^.+\\.svg$": "jest-transformer-svg",
    "\\.(png|jpe?g|gif|webp)$": "<rootDir>/jest.fileMock.js",
    "\\?worker$": "<rootDir>/jest.fileMock.js",
    "^monaco-editor$": "<rootDir>/jest.fileMock.js",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
};
