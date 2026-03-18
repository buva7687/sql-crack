const { TestEnvironment: NodeEnvironment } = require('jest-environment-node');

function createMemoryStorage() {
  const store = new Map();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key) {
      store.delete(key);
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    }
  };
}

class QuietNodeEnvironment extends NodeEnvironment {
  constructor(config, context) {
    super({
      ...config,
      projectConfig: {
        ...config.projectConfig,
        testEnvironmentOptions: {
          ...config.projectConfig.testEnvironmentOptions,
          localStorage: createMemoryStorage(),
          sessionStorage: createMemoryStorage()
        }
      }
    }, context);
  }
}

module.exports = QuietNodeEnvironment;
