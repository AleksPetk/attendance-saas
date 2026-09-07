const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// Expo-doctor expects hierarchical lookup enabled for SDK 57.
config.resolver.disableHierarchicalLookup = false;

/**
 * Shared packages use TypeScript ESM with `.js` import specifiers (NodeNext).
 * Metro must rewrite those to `.ts` when resolving workspace sources.
 */
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith(".") && moduleName.endsWith(".js")) {
    const tsCandidate = moduleName.replace(/\.js$/, ".ts");
    try {
      return context.resolveRequest(context, tsCandidate, platform);
    } catch {
      /* fall through to default */
    }
  }
  if (typeof defaultResolveRequest === "function") {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
