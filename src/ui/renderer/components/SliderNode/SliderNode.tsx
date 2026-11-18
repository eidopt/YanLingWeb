'use client';

import { asBoolean, asNumber } from '../../valueResolvers';
import type { SliderProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './SliderNode.module.css';
import { type CSSProperties, useState } from 'react';

type RangeValue = [number, number];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRange(start: number, end: number, min: number, max: number): RangeValue {
  const first = clamp(start, min, max);
  const second = clamp(end, min, max);
  return first <= second ? [first, second] : [second, first];
}

function toPercent(value: number, min: number, max: number) {
  if (max <= min) {
    return 0;
  }
  return ((value - min) / (max - min)) * 100;
}

export function SliderNode({ props, nodeLayoutStyle }: CoreNodeProps<SliderProps>) {
  const rawMin = asNumber(props.min, 0);
  const rawMax = asNumber(props.max, 100);
  const min = Math.min(rawMin, rawMax);
  const max = Math.max(rawMin, rawMax);
  const step = Math.max(asNumber(props.step, 1), 0.0001);
  const value = clamp(asNumber(props.value, max), min, max);
  const range = asBoolean(props.range);
  const initialRange = normalizeRange(asNumber(props.startValue, min), asNumber(props.endValue, value), min, max);
  const rangeKey = `${initialRange[0]}:${initialRange[1]}:${min}:${max}:${step}`;
  const [localRange, setLocalRange] = useState<{ key: string; value: RangeValue }>(() => ({
    key: rangeKey,
    value: initialRange,
  }));
  const rangeValue = localRange.key === rangeKey ? localRange.value : initialRange;

  if (range) {
    const [start, end] = rangeValue;
    const startPercent = toPercent(start, min, max);
    const endPercent = toPercent(end, min, max);
    const rangeStyle = {
      '--range-start': `${startPercent}%`,
      '--range-end': `${endPercent}%`,
    } as CSSProperties;

    return (
      <div className={styles.field} style={nodeLayoutStyle}>
        <div className={styles.rangeWrap} style={rangeStyle}>
          <div className={styles.rangeTrack} />
          <input
            type="range"
            className={`${styles.slider} ${styles.rangeInput} ${styles.rangeInputStart}`}
            aria-label="范围起点"
            value={start}
            min={min}
            max={max}
            step={step}
            onChange={(event) => {
              const nextStart = clamp(Number(event.currentTarget.value), min, end);
              setLocalRange({ key: rangeKey, value: [nextStart, end] });
            }}
          />
          <input
            type="range"
            className={`${styles.slider} ${styles.rangeInput} ${styles.rangeInputEnd}`}
            aria-label="范围终点"
            value={end}
            min={min}
            max={max}
            step={step}
            onChange={(event) => {
              const nextEnd = clamp(Number(event.currentTarget.value), start, max);
              setLocalRange({ key: rangeKey, value: [start, nextEnd] });
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.field} style={nodeLayoutStyle}>
      <input type="range" className={styles.slider} defaultValue={value} min={min} max={max} step={step} />
    </div>
  );
}
