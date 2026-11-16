// A website picture path as an Image source: the copy shipped in the app when there is one (bundledArt), else loaded from the website.
import type { ImageSourcePropType } from 'react-native';
import { webAsset } from '@zappy/ui/lib/media';
import { BUNDLED_ART } from './bundledArt.generated';

export function artSource(path?: string | null): ImageSourcePropType | null {
  if (!path) return null;
  const bundled = BUNDLED_ART[path];
  if (bundled) return bundled;
  const uri = webAsset(path);
  return uri ? { uri } : null;
}
