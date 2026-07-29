import 'react-native-get-random-values';
import { registerRootComponent } from 'expo';
import * as RN from 'react-native';
import * as ExpoSecureStore from 'expo-secure-store';

console.log('[PAC-DIAG] React Native Modules:', Object.keys(RN).slice(0, 10));
console.log('[PAC-DIAG] StatusBar:', !!RN.StatusBar);
console.log('[PAC-DIAG] StyleSheet:', !!RN.StyleSheet);
console.log('[PAC-DIAG] SecureStore:', !!ExpoSecureStore);

import { VaultScreen } from './src/screens/VaultScreen';

registerRootComponent(VaultScreen);
