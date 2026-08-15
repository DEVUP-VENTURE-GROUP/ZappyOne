import { Navigate, useSearchParams } from 'react-router-dom';
import ServiceCatalogView from '../components/catalog/ServiceCatalogView';
import { normalizeCategoryKey } from '../constants/catalogCategories';

/**
 * `/services` — the all-verticals catalog.
 *
 * Same component as every category page, just without a category key: the
 * grid spans everything and the vertical rail becomes the primary navigation.
 *
 * `?category=` is the pre-redesign entry point (home tiles, saved links, the
 * sticky rail). It now resolves to the dedicated category URL so those links
 * land on the immersive page instead of a filtered "All" tab.
 */
export default function ServicesPage() {
  const [searchParams] = useSearchParams();
  const legacyCategory = normalizeCategoryKey(searchParams.get('category'));

  if (legacyCategory && legacyCategory !== 'all') {
    const q = searchParams.get('q');
    const suffix = q ? `?q=${encodeURIComponent(q)}` : '';
    return <Navigate to={`/services/${legacyCategory}${suffix}`} replace />;
  }

  return <ServiceCatalogView />;
}
