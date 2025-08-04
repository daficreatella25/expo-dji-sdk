import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { HomeScreen } from './src/screens/HomeScreen';
import { SimulatorScreen } from './src/screens/SimulatorScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: {
            backgroundColor: '#007ACC',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen 
          name="Home" 
          component={HomeScreen} 
          options={{ 
            title: 'DJI SDK Demo',
            headerStyle: {
              backgroundColor: '#007ACC',
            },
          }} 
        />
        <Stack.Screen 
          name="Simulator" 
          component={SimulatorScreen} 
          options={{ 
            title: 'Flight Simulator',
            headerStyle: {
              backgroundColor: '#007ACC',
            },
          }} 
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}