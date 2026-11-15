/**
 * Stores slot.
 * ----------------------------------------------------------------------------
 * Stores is an action, not a tab: pressing it opens the `/shops` stack screen.
 * iOS's native Liquid Glass bar needs a route behind every item, so this file
 * exists for it — the item is `disabled` there and never selected. It is
 * hidden (`href: null`) from the custom bar elsewhere.
 *
 * If anything ever does land here (a stale deep link), go where Stores goes.
 * ----------------------------------------------------------------------------
 */

import { Redirect } from 'expo-router';

export default function StoresSlot() {
  return <Redirect href="/shops" />;
}
