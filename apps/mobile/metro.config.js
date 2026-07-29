const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Monorepo: let Metro watch the entire repo for changes in packages/*
config.watchFolders = [monorepoRoot];

// Resolve modules from both local and root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// PAC Fix: Force ALL React-related modules to the same instance in the monorepo.
// Expo SDK 54 uses automatic JSX transform which requires react/jsx-runtime separately.
// Without aliasing these, Metro resolves them from different node_modules copies,
// causing "Invalid hook call" / "Cannot read property 'useRef' of null".
config.resolver.extraNodeModules = {
  'react': path.resolve(monorepoRoot, 'node_modules/react'),
  'react/jsx-runtime': path.resolve(monorepoRoot, 'node_modules/react/jsx-runtime'),
  'react/jsx-dev-runtime': path.resolve(monorepoRoot, 'node_modules/react/jsx-dev-runtime'),
  'react-native': path.resolve(monorepoRoot, 'node_modules/react-native'),
  'scheduler': path.resolve(monorepoRoot, 'node_modules/scheduler'),
  '@react-native-async-storage/async-storage': path.resolve(monorepoRoot, 'node_modules/@react-native-async-storage/async-storage'),
};

// Block the nested react-native inside @craftzdog/react-native-buffer
// Its VirtualViewExperimentalNativeComponent has an "onModeChange" event
// that cannot be resolved by @react-native/codegen, causing bundling to fail.
config.resolver.blockList = [
  /node_modules\/@craftzdog\/react-native-buffer\/node_modules\/react-native\/.*/,
];

module.exports = config;
