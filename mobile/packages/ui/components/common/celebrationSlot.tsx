// The burst shown at a big moment (job done, booked): drawn by an app that ships Skia (customer, ServicePro register one at start); elsewhere nothing.
import React, { type ComponentType } from 'react';

let drawer: ComponentType | null = null;
export const setCelebration = (Component: ComponentType) => { drawer = Component; };

export function Celebration() {
  const Drawer = drawer;
  return Drawer ? <Drawer /> : null;
}
