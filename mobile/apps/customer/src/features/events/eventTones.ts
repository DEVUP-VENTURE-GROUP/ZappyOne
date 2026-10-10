/**
 * A colour per occasion for tiles without a photo (the websites' eventTone),
 * in the same order as the website's palette so an occasion keeps its colour.
 */
import { eventPhoto, eventToneIndex } from '@zappy/core/shared/eventPhotos';

const TONES = ['#EC4899', '#0EA5E9', '#8B5CF6', '#F59E0B', '#10B981', '#F43F5E', '#06B6D4', '#84CC16'];

export const eventTone = (occasion: unknown): string => TONES[eventToneIndex(occasion)];
export { eventPhoto };
