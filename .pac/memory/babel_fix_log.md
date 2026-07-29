# PAC Fix Log - Metro Bundler SyntaxError

## Issue: 500 TransformError
Metro bundler failed with `SyntaxError: index.ts: Cannot find module 'babel-preset-expo'`.

## MAPE-K Analysis
- **Monitor**: Red screen on Android Emulator reporting missing Babel preset.
- **Analyze**: 
    - In the monorepo, `@babel/core` is hoisted to the root `node_modules`.
    - `babel-preset-expo` was only present in `apps/mobile/node_modules`.
    - Babel's internal `require` of presets fails if they are not siblings of `@babel/core` or in its resolution path.
- **Plan**: Hoist `babel-preset-expo` to the root `node_modules`.
- **Execute**: Ran `npm install babel-preset-expo@~54.0.1 --save-dev` at the workspace root.
- **Knowledge**: Always ensure core Babel presets are available at the monorepo root to avoid transform errors during bundling.

## Status: Resolved
Preset installed at root. Metro should now be able to transform files.
