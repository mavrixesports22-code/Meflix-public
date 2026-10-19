import React from 'react';
import Svg, { Path, Rect, Circle, Polygon, Text as SvgText } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

export const PlayIcon: React.FC<IconProps> = ({ size = 24, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M8 5v14l11-7z" />
  </Svg>
);

export const PauseIcon: React.FC<IconProps> = ({ size = 24, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Rect x="5" y="4" width="5" height="16" rx="1" />
    <Rect x="14" y="4" width="5" height="16" rx="1" />
  </Svg>
);

export const Rewind10Icon: React.FC<IconProps> = ({ size = 24, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M3 8a9 9 0 1 1-.4 7M3 3v5h5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <SvgText x="12" y="15.5" textAnchor="middle" fill={color} fontSize="8" fontWeight="bold">10</SvgText>
  </Svg>
);

export const Forward10Icon: React.FC<IconProps> = ({ size = 24, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M21 8a9 9 0 1 0 .4 7M21 3v5h-5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <SvgText x="12" y="15.5" textAnchor="middle" fill={color} fontSize="8" fontWeight="bold">10</SvgText>
  </Svg>
);

export const SearchIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
  </Svg>
);

export const BackIcon: React.FC<IconProps> = ({ size = 24, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="m12 5-7 7 7 7M5 12h14" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const InfoIcon: React.FC<IconProps> = ({ size = 24, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
  </Svg>
);

export const PlusIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
  </Svg>
);

export const CheckIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M20 6L9 17l-5-5" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const VolumeIcon: React.FC<IconProps> = ({ size = 22, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const MuteIcon: React.FC<IconProps> = ({ size = 22, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="m11 4-6 5H2v6h3l6 5zM17 9l5 6M22 9l-5 6" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const SubtitlesIcon: React.FC<IconProps> = ({ size = 22, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="2" y="5" width="20" height="14" rx="3" stroke={color} strokeWidth="1.6" />
    <Path d="M10 10a3 3 0 1 0 0 4m9-4a3 3 0 1 0 0 4" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
  </Svg>
);

export const SettingsIcon: React.FC<IconProps> = ({ size = 22, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="m9 3-.7 2.2-1.5.9-2.3-.5-2 3.5 1.6 1.7v1.8L2.5 14l2 3.5 2.3-.5 1.5.9L9 21h4l.7-2.2 1.5-.9 2.3.5 2-3.5-1.6-1.7v-1.8l1.6-1.7-2-3.5-2.3.5-1.5-.9L13 3z" stroke={color} strokeWidth="1.6" />
    <Circle cx="11" cy="12" r="3" stroke={color} strokeWidth="1.6" />
  </Svg>
);

export const FullscreenIcon: React.FC<IconProps> = ({ size = 22, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const MinimizeIcon: React.FC<IconProps> = ({ size = 22, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="4" width="18" height="16" rx="2" stroke={color} strokeWidth="1.6" />
    <Path d="M13 12h6v6h-6z" stroke={color} strokeWidth="1.6" />
  </Svg>
);

export const CloseIcon: React.FC<IconProps> = ({ size = 22, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </Svg>
);

export const EpisodesIcon: React.FC<IconProps> = ({ size = 22, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="4" width="18" height="16" rx="2" stroke={color} strokeWidth="1.6" />
    <Path d="M7 9h10M7 13h10M7 17h6" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
  </Svg>
);

export const HomeIcon: React.FC<IconProps> = ({ size = 22, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="m3 10 9-7 9 7v10H15v-7H9v7H3z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const PopularIcon: React.FC<IconProps> = ({ size = 22, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 8h16v13H4zM7 4h13M10 1h10M10 11l5 3-5 3z" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const MyListIcon: React.FC<IconProps> = ({ size = 22, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="4" y="3" width="16" height="18" rx="3" stroke={color} strokeWidth="1.6" />
    <Path d="M8 14c2 3 6 3 8 0M8 8v2m8-2v2" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
  </Svg>
);

export const UserIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
  </Svg>
);

export const HelpIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M11 17h2v-2h-2v2zm1-15a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm0-14a4 4 0 0 0-4 4h2a2 2 0 1 1 3.4 1.4C12.5 12.2 11 13 11 14h2c0-.5.9-1.1 1.8-1.9A3.6 3.6 0 0 0 16 9.5 3.8 3.8 0 0 0 12 6z" />
  </Svg>
);

export const CaretDownIcon: React.FC<IconProps> = ({ size = 10, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 10 10">
    <Polygon points="0,2 10,2 5,8" fill={color} />
  </Svg>
);

export const LockIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="5" y="11" width="14" height="10" rx="2" stroke={color} strokeWidth="1.8" />
    <Path d="M8 11V7a4 4 0 0 1 8 0v4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <Circle cx="12" cy="16" r="1.2" fill={color} />
  </Svg>
);

export const UnlockIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="5" y="11" width="14" height="10" rx="2" stroke={color} strokeWidth="1.8" />
    <Path d="M8 11V7a4 4 0 0 1 7.5-2" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <Circle cx="12" cy="16" r="1.2" fill={color} />
  </Svg>
);

export const SpeedIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 4a8 8 0 0 0-8 8c0 2.2.9 4.2 2.3 5.7l1.4-1.4A6 6 0 0 1 6 12a6 6 0 1 1 12 0c0 1.7-.7 3.2-1.7 4.3l1.4 1.4A8 8 0 0 0 12 4z" fill={color} />
    <Path d="m12 12 3.5-3.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Circle cx="12" cy="12" r="2" fill={color} />
  </Svg>
);

export const AudioSubtitlesIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    <Path d="M7 8h10M7 12h6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
  </Svg>
);

export const NextEpisodeIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" fill={color} />
  </Svg>
);

export const AspectFitIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="5" width="18" height="14" rx="2" stroke={color} strokeWidth="1.8" />
    <Path d="M3 10h18M3 14h18" stroke={color} strokeWidth="1.2" strokeDasharray="2 2" />
  </Svg>
);

export const ShieldIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M9 12l2 2 4-4" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const RefreshIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l.67-.8" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const TrashIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const DeviceIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="5" y="2" width="14" height="20" rx="3" stroke={color} strokeWidth="1.8" />
    <Path d="M11 18h2" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const BrightnessIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="5" stroke={color} strokeWidth="1.8" />
    <Path
      d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </Svg>
);

export const PencilIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const NetflixSmileyIcon: React.FC<IconProps> = ({ size = 48, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <Circle cx="10" cy="12" r="2.2" fill={color} />
    <Circle cx="22" cy="12" r="2.2" fill={color} />
    <Path d="M8 20c2.5 3.5 13.5 3.5 16 0" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
  </Svg>
);




