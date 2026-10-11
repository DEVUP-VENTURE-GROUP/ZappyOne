import { Link } from 'react-router-dom';
import { Trash2, Smartphone, Mail, ShieldCheck } from 'lucide-react';
import SEO from '@shared/components/SEO';

/**
 * How to delete a ZappyOne account, public and signed-out (Google Play's
 * account-deletion web link). Covers every app, says what is removed and what
 * is kept, and gives a way to ask without the app.
 */
const APPS = [
  ['ZappyOne (customers)', 'Profile → Account Security → Delete my account'],
  ['ZappyOne ServicePro (shops)', 'Account → Delete my account'],
  ['ZappyOne Rakshak (independent professionals)', 'Profile → Delete my account'],
];
const EMAIL = 'support@zappyone.com';

export default function DeleteAccountPage() {
  return (
    <div className="min-h-screen bg-canvas px-4 py-10">
      <SEO title="Delete your account | ZappyOne" description="How to delete your ZappyOne account and what happens to your data." />
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-btn bg-red-50 text-red-600"><Trash2 size={20} /></span>
          <h1 className="text-2xl font-bold text-ink-900">Delete your ZappyOne account</h1>
        </div>

        <section className="card space-y-3">
          <h2 className="flex items-center gap-2 font-semibold text-ink-900"><Smartphone size={17} /> In the app</h2>
          <ul className="space-y-2 text-sm text-ink-700">
            {APPS.map(([app, path]) => <li key={app}><span className="font-semibold">{app}:</span> {path}</li>)}
          </ul>
          <p className="text-sm text-ink-500">On the website, sign in and open Profile → Account Security. Finish any open booking and withdraw any wallet balance first; the app tells you if something is still open.</p>
        </section>

        <section className="card space-y-2">
          <h2 className="flex items-center gap-2 font-semibold text-ink-900"><Mail size={17} /> Without the app</h2>
          <p className="text-sm text-ink-700">
            Email <a className="font-semibold text-zappy-600" href={`mailto:${EMAIL}?subject=Delete%20my%20account`}>{EMAIL}</a> from
            the email on your account, or include the phone number you signed up with. We confirm it is you, then delete the account within 7 days and reply when it is done.
          </p>
        </section>

        <section className="card space-y-2">
          <h2 className="flex items-center gap-2 font-semibold text-ink-900"><ShieldCheck size={17} /> What happens to your data</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-700">
            <li>Removed straight away: your sign-in, name, phone number, email, photo, saved addresses and recent locations, saved cards, bank and UPI details, and notification tokens. You are signed out on every device.</li>
            <li>Professionals and shops are removed from search and matching at once.</li>
            <li>Kept without your details: past bookings, payments and invoices, because tax and dispute rules require them.</li>
            <li>Identity documents submitted for verification are kept only as long as the law requires, then deleted.</li>
          </ul>
          <p className="text-sm text-ink-500">Read the full <Link to="/policy/privacy-policy" className="font-semibold text-zappy-600">privacy policy</Link>.</p>
        </section>
      </div>
    </div>
  );
}
