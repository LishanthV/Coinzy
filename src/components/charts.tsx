import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';
import { colors, fonts, fontSizes, spacing } from '../theme';

// ── Ring gauge — the dashboard's signature element ─────────────────────
// A single arc that sweeps to show "how much of this month's flow has
// been spent", with a soft glow-style double stroke.
export function RingGauge({
  progress,
  size = 132,
  strokeWidth = 12,
  color = colors.primary,
  trackColor = colors.surfaceAlt,
  label,
  value,
}: {
  progress: number; // 0..1
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  value?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(progress, 1));
  const dashOffset = circumference * (1 - clamped);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={trackColor}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            fill="none"
          />
        </G>
      </Svg>
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.ringCenter}>
          {value ? <Text style={styles.ringValue}>{value}</Text> : null}
          {label ? <Text style={styles.ringLabel}>{label}</Text> : null}
        </View>
      </View>
    </View>
  );
}

// ── Donut chart — category breakdown ───────────────────────────────────
export interface DonutSlice {
  value: number;
  color: string;
}

export function DonutChart({
  data,
  size = 160,
  strokeWidth = 20,
}: {
  data: DonutSlice[];
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;

  let cumulative = 0;
  return (
    <Svg width={size} height={size}>
      <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
        {data.map((slice, i) => {
          const fraction = slice.value / total;
          const dash = circumference * fraction;
          const gap = circumference - dash;
          const offset = circumference * (1 - cumulative);
          cumulative += fraction;
          return (
            <Circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={slice.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={offset}
              fill="none"
            />
          );
        })}
      </G>
    </Svg>
  );
}

// ── Bar chart — weekly / monthly trend ──────────────────────────────────
export interface BarDatum {
  label: string;
  value: number;
  color?: string;
}

export function BarChart({
  data,
  height = 160,
  barColor = colors.primary,
}: {
  data: BarDatum[];
  height?: number;
  barColor?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const barWidth = 100 / data.length;

  return (
    <View style={{ height: height + 28 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height }}>
        {data.map((d, i) => {
          const h = Math.max((d.value / max) * height, 4);
          return (
            <View key={i} style={{ width: `${barWidth}%`, alignItems: 'center' }}>
              <View
                style={{
                  width: '55%',
                  height: h,
                  borderRadius: 6,
                  backgroundColor: d.color ?? barColor,
                }}
              />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', marginTop: spacing.xs }}>
        {data.map((d, i) => (
          <View key={i} style={{ width: `${barWidth}%`, alignItems: 'center' }}>
            <Text style={styles.barLabel}>{d.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Sparkline — small trend line ────────────────────────────────────────
export function Sparkline({
  data,
  width = 120,
  height = 36,
  color = colors.income,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (data.length < 2) return <View style={{ width, height }} />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  });

  const path = `M${points.join(' L')}`;

  return (
    <Svg width={width} height={height}>
      <Path d={path} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  ringCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    color: colors.text,
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.xl,
  },
  ringLabel: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  barLabel: {
    color: colors.textFaint,
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
  },
});
