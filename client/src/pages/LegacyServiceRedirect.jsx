import { Navigate, useParams } from 'react-router-dom';
import { useLiveCatalogQuery } from '@shared/services/api';

/**
 * Old booking links — /book/:service and /service/:code — from past receipts,
 * notifications, shared links and search engines.
 *
 * The old one-page booking flow is gone; every service now books through its
 * own live flow. A link to a service that is live opens that flow; anything
 * else lands on All services rather than on a page that can't book.
 */
export default function LegacyServiceRedirect() {
  const { service, code } = useParams();
  const wanted = String(service || code || '').toLowerCase();
  const { data, isLoading } = useLiveCatalogQuery();
  if (isLoading) return null;

  const live = (data?.domains || []).flatMap((d) => d.services);
  const match = live.find((s) => s.code === wanted)
    // Old codes were often the vertical itself ("laptop", "two_wheeler").
    || live.find((s) => wanted && s.path.replace(/-/g, '_').endsWith(`/${wanted}`));
  return <Navigate to={match?.path || '/services'} replace />;
}
