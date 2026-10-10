/**
 * Open turn-by-turn directions to a point in the phone's maps app.
 */
import { openLink } from './openLink';

export const directions = (lat: number, lng: number) => openLink(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, 'Could not open maps on this phone.');
