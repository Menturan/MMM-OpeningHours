// The tests use local times. Pin the time zone so they give the same result on every machine.
process.env.TZ = 'UTC'

module.exports = {
  clearMocks: true,
  coverageDirectory: 'coverage',
  testEnvironment: 'node'
}
