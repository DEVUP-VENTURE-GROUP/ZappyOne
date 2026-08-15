import { Navigate, useParams } from 'react-router-dom';
import ServiceCatalogView from '../components/catalog/ServiceCatalogView';
import { normalizeCategoryKey } from '../constants/catalogCategories';

/**
 * `/services/:category` — Car Services, Phone Repair, Plumbing, Cleaning…
 *
 * A thin wrapper by design: the entire experience lives in ServiceCatalogView,
 * so every vertical is identical in behaviour and differs only by config. An
 * unrecognised key falls back to the full catalog rather than 404-ing, which
 * keeps old links and typo'd shares working.
 */
export default function CategoryCatalogPage() {
  const { category } = useParams();
  const key = normalizeCategoryKey(category);

  if (!key) return <Navigate to="/services" replace />;
  // Aliases (e.g. /services/smart_device) settle on their canonical URL.
  if (key !== category) return <Navigate to={`/services/${key}`} replace />;

  return <ServiceCatalogView categoryKey={key} />;
}
