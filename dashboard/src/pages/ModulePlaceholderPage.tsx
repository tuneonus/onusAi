import { useNavigate } from 'react-router-dom';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { ROUTES, type NavItemConfig } from '../config/routes';

interface ModulePlaceholderPageProps {
  module: NavItemConfig;
}

export function ModulePlaceholderPage({ module }: ModulePlaceholderPageProps) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader
        title={module.label}
        subtitle={module.description}
        actions={
          <Button variant="secondary" size="sm" onClick={() => navigate(ROUTES.overview)}>
            Back to Overview
          </Button>
        }
      />
      <CardBody>
        <Alert tone="info" title="Module coming soon">
          This workspace capability is scheduled for upcoming implementation and is not enabled yet.
          No placeholder or synthetic records are displayed here.
        </Alert>
      </CardBody>
    </Card>
  );
}
