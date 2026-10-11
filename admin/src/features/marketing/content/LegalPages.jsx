import { useAdminMessagesQuery } from '@shared/services/api';
import { Card } from '../../../ui/kit';
import { BusinessDetails } from '../../system/Messages';
import Content from './HelpContent';

/**
 * Every legal page in one place: privacy policy, terms, partner terms,
 * cancellation and refunds, warranty, account deletion, grievance redressal.
 * Each is edited here and read by all the apps and websites. The company
 * details they show (legal name, address, GSTIN, grievance officer) are set
 * once below and fill every page.
 */
export default function LegalPages() {
  const { data } = useAdminMessagesQuery();
  return (
    <div className="space-y-6">
      <Content type="policy" title="Legal pages"
        subtitle="Privacy, terms, refunds, warranty, account deletion and grievances, as shown on every app and website. Linked from the store listings: keep them accurate." />
      <Card className="max-w-3xl">
        <h3 className="text-base font-extrabold text-slate-900">Company details on these pages</h3>
        <p className="mb-3 text-sm text-slate-500">Indian law requires the registered address and a named Grievance Officer. A detail left blank is hidden from the pages.</p>
        {data?.settings ? <BusinessDetails s={data.settings} /> : <p className="text-sm text-slate-400">Loading…</p>}
      </Card>
    </div>
  );
}
