import { Navigate, useParams } from 'react-router-dom';
import { useRepairVerticalsQuery } from '@shared/services/api';
import RepairFlowPage from './RepairFlowPage';

// /repair/<service>: any service the server books opens the same flow, so a line added in admin needs no new route.
export default function ServiceFlowRoute() {
  const { slug = '' } = useParams();
  const { data, isLoading } = useRepairVerticalsQuery();
  const vertical = slug.replace(/-/g, '_');
  if (isLoading) return null;
  if (!data?.items?.some((i) => i.vertical === vertical && i.status === 'live')) return <Navigate to="/services" replace />;
  return <RepairFlowPage key={vertical} vertical={vertical} />;
}
