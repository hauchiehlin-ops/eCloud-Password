# PAC Fix Log - IAP Initialization Error (Nitro Runtime)

## Issue: Runtime Error
`[RN-IAP] Failed to initialize IAP connection: [Error: Nitro runtime not installed yet...]`.

## MAPE-K Analysis
- **Monitor**: App logs show IAP failure due to missing Nitro runtime.
- **Analyze**: 
    - `react-native-iap` version 15.x requires `react-native-nitro-modules` as a peer/direct dependency for its new C++ core.
    - The dependency was missing from `apps/mobile/package.json`.
- **Plan**: Install `react-native-nitro-modules` and request a native rebuild.
- **Execute**: Ran `npx expo install react-native-nitro-modules` in `apps/mobile`.
- **Knowledge**: Always check for companion libraries like Nitro when upgrading native modules to high-performance versions.

## Status: Pending Rebuild
Dependency installed. A full native rebuild is required to link the Nitro runtime.
