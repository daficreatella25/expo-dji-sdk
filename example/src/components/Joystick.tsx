import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedGestureHandler,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { PanGestureHandler } from 'react-native-gesture-handler';

export interface JoystickValue {
  x: number; // -1 to 1
  y: number; // -1 to 1
}

export interface JoystickProps {
  label?: string;
  onValueChange?: (value: JoystickValue) => void;
  onStart?: () => void;
  onEnd?: () => void;
  size?: number;
  knobSize?: number;
  isActive?: boolean;
}

export default function Joystick({
  label,
  onValueChange,
  onStart,
  onEnd,
  size = 120,
  knobSize = 50,
  isActive = false,
}: JoystickProps) {
  const knobX = useSharedValue(0);
  const knobY = useSharedValue(0);
  const maxDistance = (size - knobSize) / 2;

  const gestureHandler = useAnimatedGestureHandler({
    onStart: () => {
      if (onStart) {
        runOnJS(onStart)();
      }
    },
    
    onActive: (event: any) => {
      const { translationX, translationY } = event;
      const distance = Math.sqrt(translationX * translationX + translationY * translationY);
      
      // Limit the knob to the joystick area
      let limitedX = translationX;
      let limitedY = translationY;
      
      if (distance > maxDistance) {
        limitedX = (translationX / distance) * maxDistance;
        limitedY = (translationY / distance) * maxDistance;
      }
      
      // Update knob position
      knobX.value = limitedX;
      knobY.value = limitedY;
      
      // Convert to -1 to 1 range
      const normalizedX = limitedX / maxDistance;
      const normalizedY = -limitedY / maxDistance; // Invert Y axis
      
      // Send value change
      if (onValueChange) {
        runOnJS(onValueChange)({ x: normalizedX, y: normalizedY });
      }
    },
    
    onEnd: () => {
      // Return to center with spring animation
      knobX.value = withSpring(0);
      knobY.value = withSpring(0);
      
      if (onEnd) {
        runOnJS(onEnd)();
      }
      if (onValueChange) {
        runOnJS(onValueChange)({ x: 0, y: 0 });
      }
    },
  });
  
  const knobAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: knobX.value },
        { translateY: knobY.value },
      ],
    };
  });

  return (
    <View style={styles.container}>
      {label && (
        <Text style={styles.label}>{label}</Text>
      )}
      <PanGestureHandler onGestureEvent={gestureHandler} onHandlerStateChange={gestureHandler}>
        <Animated.View 
          style={[
            styles.joystickArea,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
            },
            isActive && styles.joystickActive
          ]}
        >
          <Animated.View 
            style={[
              styles.joystickKnob,
              {
                width: knobSize,
                height: knobSize,
                borderRadius: knobSize / 2,
              },
              knobAnimatedStyle
            ]} 
          />
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  label: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  joystickArea: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  joystickActive: {
    backgroundColor: 'rgba(0, 255, 100, 0.2)',
    borderColor: 'rgba(0, 255, 100, 0.6)',
  },
  joystickKnob: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
});