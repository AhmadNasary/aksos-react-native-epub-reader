import React from 'react';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

/**
 * Vector icon set (24 x 24 grid, rounded strokes). Every icon takes the colour it is drawn in, so it follows the
 * theme (light / dark / any page colour). Some icons carry state: `active` fills or closes them
 * (bookmark, rotation lock, line guide).
 */
export type IconName =
  | 'close' | 'check' | 'chevronRight' | 'chevronUp' | 'chevronDown'
  | 'list' | 'search' | 'textSize' | 'share' | 'bookmark' | 'rotationLock' | 'lineGuide' | 'undo'
  | 'sun' | 'sunLow' | 'moon' | 'contrast'
  | 'pageSlide' | 'pageCurl' | 'pageFade' | 'pageScroll'
  | 'sliders' | 'lineSpacing' | 'charSpacing' | 'wordSpacing' | 'margins' | 'columns' | 'bold' | 'justify'
  | 'trash' | 'pencil' | 'underline' | 'highlighter' | 'sound' | 'soundOff';

interface Props {
  name: IconName;
  color: string;
  size?: number;
  /** filled / closed state for bookmark, rotation lock, line guide */
  active?: boolean;
  strokeWidth?: number;
}

const RAYS = [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return { x1: 12 + 6.6 * Math.cos(a), y1: 12 + 6.6 * Math.sin(a), x2: 12 + 9.2 * Math.cos(a), y2: 12 + 9.2 * Math.sin(a) };
});

export function Icon({ name, color, size = 24, active = false, strokeWidth = 1.8 }: Props) {
  const p = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  let body: React.ReactNode = null;

  switch (name) {
    case 'close':
      body = <Path d="M6 6 L18 18 M18 6 L6 18" {...p} />;
      break;
    case 'check':
      body = <Path d="M5 12.5 L10 17.5 L19 7" {...p} />;
      break;
    case 'chevronRight':
      body = <Path d="M9 5.5 L15.5 12 L9 18.5" {...p} />;
      break;
    case 'chevronUp':
      body = <Path d="M5.5 15 L12 8.5 L18.5 15" {...p} />;
      break;
    case 'chevronDown':
      body = <Path d="M5.5 9 L12 15.5 L18.5 9" {...p} />;
      break;
    case 'list':
      body = (
        <G>
          {[7, 12, 17].map((y) => (
            <G key={y}>
              <Circle cx={4.8} cy={y} r={1.25} fill={color} />
              <Path d={`M9 ${y} H20`} {...p} />
            </G>
          ))}
        </G>
      );
      break;
    case 'search':
      body = (
        <G>
          <Circle cx={10.8} cy={10.8} r={6.3} {...p} />
          <Path d="M15.6 15.6 L20.5 20.5" {...p} />
        </G>
      );
      break;
    case 'textSize':
      body = (
        <G>
          <Path d="M2.8 18 L6.3 9.2 L9.8 18 M4.1 14.9 H8.5" {...p} />
          <Path d="M11.6 18 L16.6 5.6 L21.6 18 M13.5 13.6 H19.7" {...p} />
        </G>
      );
      break;
    case 'share':
      body = (
        <G>
          <Path d="M8.5 10 H7 A1.7 1.7 0 0 0 5.3 11.7 V19 A1.7 1.7 0 0 0 7 20.7 H17 A1.7 1.7 0 0 0 18.7 19 V11.7 A1.7 1.7 0 0 0 17 10 H15.5" {...p} />
          <Path d="M12 14.5 V3.5 M8.2 7.3 L12 3.5 L15.8 7.3" {...p} />
        </G>
      );
      break;
    case 'bookmark':
      body = (
        <Path
          d="M7.2 3.8 H16.8 A1.2 1.2 0 0 1 18 5 V20.2 L12 16.2 L6 20.2 V5 A1.2 1.2 0 0 1 7.2 3.8 Z"
          {...p}
          fill={active ? color : 'none'}
        />
      );
      break;
    case 'rotationLock':
      body = (
        <G>
          <Path d="M20.2 13 A8.2 8.2 0 1 1 17 5.9" {...p} />
          <Path d="M17.2 2.8 V6.2 H13.8" {...p} />
          <Rect x={9} y={11.2} width={6} height={5} rx={1.2} {...p} fill={active ? color : 'none'} />
          <Path d={active ? 'M10.4 11.2 V10 A1.6 1.6 0 0 1 13.6 10 V11.2' : 'M10.4 11.2 V9.9 A1.6 1.6 0 0 1 13.6 9.9'} {...p} />
        </G>
      );
      break;
    case 'lineGuide':
      body = (
        <G>
          <Path d="M4 6.2 H20 M4 17.8 H20" {...p} opacity={0.5} />
          <Rect x={2.8} y={9.2} width={18.4} height={5.6} rx={2.8} {...p} fill={active ? color : 'none'} fillOpacity={active ? 0.28 : 0} />
        </G>
      );
      break;
    case 'undo':
      body = <Path d="M8.5 6 L4 10.5 L8.5 15 M4.5 10.5 H14.5 A5 5 0 0 1 14.5 20.5 H11" {...p} />;
      break;
    case 'sun':
      body = (
        <G>
          <Circle cx={12} cy={12} r={3.9} {...p} />
          {RAYS.map((r, i) => (
            <Line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} {...p} />
          ))}
        </G>
      );
      break;
    case 'sunLow':
      body = (
        <G>
          <Circle cx={12} cy={12} r={2.4} {...p} />
          {RAYS.map((r, i) => (
            <Line key={i} x1={12 + (r.x1 - 12) * 0.8} y1={12 + (r.y1 - 12) * 0.8} x2={12 + (r.x2 - 12) * 0.62} y2={12 + (r.y2 - 12) * 0.62} {...p} />
          ))}
        </G>
      );
      break;
    case 'moon':
      body = <Path d="M20 14.2 A8.4 8.4 0 1 1 9.8 4 A6.6 6.6 0 0 0 20 14.2 Z" {...p} />;
      break;
    case 'contrast':
      body = (
        <G>
          <Circle cx={12} cy={12} r={8.2} {...p} />
          <Path d="M12 3.8 A8.2 8.2 0 0 1 12 20.2 Z" fill={color} stroke={color} strokeWidth={1} />
        </G>
      );
      break;
    case 'pageSlide':
      body = (
        <G>
          <Path d="M9 5.2 H5.2 A1.9 1.9 0 0 0 3.3 7.1 V17.9 A1.9 1.9 0 0 0 5.2 19.8 H9" {...p} opacity={0.55} />
          <Rect x={8} y={3.2} width={12.7} height={16.6} rx={2.4} {...p} />
        </G>
      );
      break;
    case 'pageCurl':
      body = (
        <G>
          <Path d="M6.7 3.5 H14.5 L20 9 V18.6 A1.9 1.9 0 0 1 18.1 20.5 H6.7 A1.9 1.9 0 0 1 4.8 18.6 V5.4 A1.9 1.9 0 0 1 6.7 3.5 Z" {...p} />
          <Path d="M14.5 3.5 V7.4 A1.6 1.6 0 0 0 16.1 9 H20" {...p} />
        </G>
      );
      break;
    case 'pageFade':
      body = <Path d="M13.2 2.8 L5.2 13.2 H11 L10.2 21.2 L18.8 10.4 H13 Z" {...p} />;
      break;
    case 'pageScroll':
      body = (
        <G>
          <Rect x={5} y={3} width={14} height={18} rx={2.4} {...p} />
          <Path d="M9.4 9.6 L12 7 L14.6 9.6 M9.4 14.4 L12 17 L14.6 14.4" {...p} />
        </G>
      );
      break;
    case 'sliders':
      body = (
        <G>
          <Path d="M3.5 8 H9.2 M14.8 8 H20.5 M3.5 16 H14.2 M19.8 16 H20.5" {...p} />
          <Circle cx={12} cy={8} r={2.8} {...p} />
          <Circle cx={17} cy={16} r={2.8} {...p} />
        </G>
      );
      break;
    case 'lineSpacing':
      body = <Path d="M10.5 6.5 H20.5 M10.5 12 H20.5 M10.5 17.5 H20.5 M5 4.5 V19.5 M2.9 6.6 L5 4.5 L7.1 6.6 M2.9 17.4 L5 19.5 L7.1 17.4" {...p} />;
      break;
    case 'charSpacing':
      body = <Path d="M7.6 13.6 L12 3.8 L16.4 13.6 M9.2 10.4 H14.8 M3.8 19.2 H20.2 M6.2 16.9 L3.8 19.2 L6.2 21.5 M17.8 16.9 L20.2 19.2 L17.8 21.5" {...p} />;
      break;
    case 'wordSpacing':
      body = (
        <G>
          <Rect x={2.8} y={4.5} width={7} height={4.2} rx={1.2} {...p} />
          <Rect x={14.2} y={4.5} width={7} height={4.2} rx={1.2} {...p} />
          <Path d="M3.8 15.2 H20.2 M6.2 12.9 L3.8 15.2 L6.2 17.5 M17.8 12.9 L20.2 15.2 L17.8 17.5" {...p} />
        </G>
      );
      break;
    case 'margins':
      body = (
        <G>
          <Rect x={3.8} y={3} width={16.4} height={18} rx={2.4} {...p} />
          <Path d="M8 7 V17 M16 7 V17" {...p} />
        </G>
      );
      break;
    case 'columns':
      body = (
        <G>
          <Rect x={3.5} y={4} width={7.6} height={16} rx={1.8} {...p} />
          <Rect x={12.9} y={4} width={7.6} height={16} rx={1.8} {...p} />
        </G>
      );
      break;
    case 'bold':
      body = <Path d="M8 4.6 V19.4 M8 4.6 H13 A3.6 3.6 0 0 1 13 11.8 H8 M8 11.8 H14 A3.8 3.8 0 0 1 14 19.4 H8" {...p} strokeWidth={strokeWidth + 0.5} />;
      break;
    case 'justify':
      body = <Path d="M4 6 H20 M4 10 H20 M4 14 H20 M4 18 H20" {...p} />;
      break;
    case 'trash':
      body = <Path d="M4.5 7 H19.5 M9.3 7 V4.6 H14.7 V7 M6.6 7 L7.6 19.6 A1.2 1.2 0 0 0 8.8 20.7 H15.2 A1.2 1.2 0 0 0 16.4 19.6 L17.4 7 M10.2 10.8 V16.4 M13.8 10.8 V16.4" {...p} />;
      break;
    case 'pencil':
      body = <Path d="M4 20 L5.2 15.2 L16.2 4.2 A2.2 2.2 0 0 1 19.4 7.4 L8.4 18.4 Z M14 6.4 L17.2 9.6" {...p} />;
      break;
    case 'highlighter':
      body = <Path d="M14.2 4.6 L19.4 9.8 L10.6 18.6 L5.4 13.4 Z M5.4 13.4 L4.2 17.6 L7.6 18.6 M3.5 21 H12.5" {...p} />;
      break;
    case 'underline':
      body = <Path d="M7.4 4.4 V11 A4.6 4.6 0 0 0 16.6 11 V4.4 M5 20 H19" {...p} />;
      break;
    case 'sound':
      body = <Path d="M4 9.5 H7.5 L12.5 5.2 V18.8 L7.5 14.5 H4 Z M16 9 A4.2 4.2 0 0 1 16 15 M18.6 6.6 A7.6 7.6 0 0 1 18.6 17.4" {...p} />;
      break;
    case 'soundOff':
      body = <Path d="M4 9.5 H7.5 L12.5 5.2 V18.8 L7.5 14.5 H4 Z M16.2 9.4 L21 14.6 M21 9.4 L16.2 14.6" {...p} />;
      break;
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
  );
}
