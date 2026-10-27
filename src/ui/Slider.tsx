import React, { useRef } from 'react';
import { Scrubber } from './Scrubber';

interface Props {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  color: string;
  track: string;
  thumbColor?: string;
}

const round = (v: number, step: number) => Math.round(v / step) * step;

/** Value slider on top of Scrubber; emits only when the stepped value changes. */
export function Slider({ value, min, max, step, onChange, color, track, thumbColor }: Props) {
  const last = useRef(value);
  const toValue = (f: number) => +(round(min + f * (max - min), step)).toFixed(4);
  const emit = (f: number) => {
    const v = toValue(f);
    if (v !== last.current) {
      last.current = v;
      onChange(v);
    }
  };
  last.current = value;
  return <Scrubber value={(value - min) / (max - min)} color={color} track={track} thumbColor={thumbColor} onScrub={emit} onComplete={emit} />;
}
