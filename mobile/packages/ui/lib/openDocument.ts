/**
 * Open a receipt, invoice or service report in the phone's browser. The
 * browser cannot send the app's sign-in, so the server gives a link good for
 * five minutes and only for that document (account/doc-link).
 *
 *   const { open, opening } = useOpenDocument();
 *   open(`/api/jobs/${id}/receipt`)
 */
import { useCallback, useState } from 'react';
import { useDocLinkMutation } from '@zappy/core/api';
import { API_ORIGIN } from '@zappy/core/config/env';
import { toast } from '../components/Toast';
import { errText } from './feedback';
import { openLink } from './openLink';

export function useOpenDocument() {
  const [getLink] = useDocLinkMutation();
  const [opening, setOpening] = useState<string | null>(null);
  const open = useCallback(async (path: string) => {
    setOpening(path);
    try {
      const { token } = await getLink(path).unwrap();
      openLink(`${API_ORIGIN}${path}?dl=${encodeURIComponent(token)}`, 'This phone could not open the document.');
    } catch (err) { toast.error(errText(err, 'Could not open the document. Try again.')); }
    finally { setOpening(null); }
  }, [getLink]);
  return { open, opening };
}
