const config = {
  test: {
    environment: "node",
    include: ["tests/core/**/*.test.ts"],
    testTimeout: 15_000,
  },
};

export default config;
