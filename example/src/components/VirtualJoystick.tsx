import React from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring,
  runOnJS
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

interface VirtualJoystickProps {
  onMove?: (x: number, y: number) => void;
  size?: number;
  knobSize?: number;
  backgroundColor?: string;
  knobColor?: string;
  style?: any;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({
  onMove,
  size = 120,
  knobSize = 40,
  backgroundColor = '#E0E0E0',
  knobColor = '#007ACC',
  style,
}) => {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  
  const maxDistance = (size - knobSize) / 2;
  const centerX = size / 2;
  const centerY = size / 2;

  const callOnMove = (x: number, y: number) => {
    'worklet';
    if (onMove) {
      runOnJS(onMove)(x, y);
    }
  };

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      const { translationX, translationY } = event;
      
      // Calculate distance from center
      const distance = Math.sqrt(translationX * translationX + translationY * translationY);
      
      // Clamp to max distance
      let clampedX = translationX;
      let clampedY = translationY;
      
      if (distance > maxDistance) {
        const ratio = maxDistance / distance;
        clampedX = translationX * ratio;
        clampedY = translationY * ratio;
      }
      
      translateX.value = clampedX;
      translateY.value = clampedY;
      
      // Normalize to -1 to 1 range
      const normalizedX = clampedX / maxDistance;
      const normalizedY = -clampedY / maxDistance; // Invert Y axis
      
      callOnMove(normalizedX, normalizedY);
    })
    .onEnd(() => {
      // Return to center
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
      
      callOnMove(0, 0);
    });

  const knobAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
      ],
    };
  });

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {/* Outer circle */}
        <Circle
          cx={centerX}
          cy={centerY}
          r={size / 2}
          fill={backgroundColor}
          stroke="#CCCCCC"
          strokeWidth={2}
        />
        {/* Center dot */}
        <Circle
          cx={centerX}
          cy={centerY}
          r={2}
          fill="#999999"
        />
      </Svg>

      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: knobSize,
              height: knobSize,
              borderRadius: knobSize / 2,
              backgroundColor: knobColor,
              left: centerX - knobSize / 2,
              top: centerY - knobSize / 2,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.3,
              shadowRadius: 3,
              elevation: 5,
            },
            knobAnimatedStyle,
          ]}
        />
      </GestureDetector>
    </View>
  );
};