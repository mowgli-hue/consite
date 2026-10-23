/**
 * /hours → /reports alias. Old links and muscle memory land here;
 * an "Unmatched Route" page is never the right answer.
 */

import { Redirect } from 'expo-router';

export default function HoursAlias() {
  return <Redirect href={'/(admin)/reports' as never} />;
}
