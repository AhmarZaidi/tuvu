import React from 'react';
import {
  Image as RNImage,
  ImageProps as RNImageProps,
  ImageSourcePropType,
  ImageResizeMode,
} from 'react-native';

export interface AppImageProps extends Omit<RNImageProps, 'source' | 'resizeMode'> {
  source?: ImageSourcePropType | { uri?: string | null } | number | null;
  contentFit?: 'cover' | 'contain' | 'fill' | 'inside' | 'none' | 'scale-down';
  resizeMode?: ImageResizeMode;
  transition?: number;
  priority?: 'low' | 'normal' | 'high';
  cachePolicy?: string;
  placeholder?: any;
}

export function AppImage({
  source,
  contentFit = 'cover',
  resizeMode,
  style,
  ...rest
}: AppImageProps) {
  if (!source) return null;

  // Handle empty uri objects
  if (typeof source === 'object' && source !== null && 'uri' in source && !source.uri) {
    return null;
  }

  let finalResizeMode: ImageResizeMode = 'cover';
  if (resizeMode) {
    finalResizeMode = resizeMode;
  } else if (contentFit === 'contain' || contentFit === 'scale-down') {
    finalResizeMode = 'contain';
  } else if (contentFit === 'fill') {
    finalResizeMode = 'stretch';
  } else if (contentFit === 'none') {
    finalResizeMode = 'center';
  } else {
    finalResizeMode = 'cover';
  }

  return (
    <RNImage
      source={source as ImageSourcePropType}
      resizeMode={finalResizeMode}
      style={style}
      {...rest}
    />
  );
}

export { AppImage as Image };
