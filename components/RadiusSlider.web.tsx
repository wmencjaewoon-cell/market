import React from 'react';
import { StyleSheet, View } from 'react-native';

type Props = {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChangeEnd: (value: number) => void;
};

export default function RadiusSlider({
  value,
  min = 1,
  max = 20,
  step = 1,
  onChangeEnd,
}: Props) {
  return (
    <View style={styles.wrap}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChangeEnd(Number(e.currentTarget.value))}
        style={styles.slider as any}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    paddingVertical: 6,
  },
  slider: {
    width: '100%',
  },
});