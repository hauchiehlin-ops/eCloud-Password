import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function SimpleApp() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>DEBUG MODE: CORE LOADED</Text>
      <Text style={{color: '#888', marginTop: 10}}>LEGACY ARCHITECTURE ENABLED</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: '#FFC107',
    fontSize: 20,
    fontWeight: 'bold',
  },
});
