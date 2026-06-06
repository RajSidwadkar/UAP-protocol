/**
 * Zero-dependency environment validation script.
 */
const REQUIRED_VARS = ['NODE_VERSION', 'PYTHON_VERSION', 'DOCKER_VERSION'];

function validate() {
  const missing = REQUIRED_VARS.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  console.log('✓ Environment validation: PASS');
}

try {
  validate();
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
