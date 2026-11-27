export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export interface PublicBranding {
  productName: string;
  shortName: string;
  tagline: string;
  attributionText: string;
}

export interface ApiHealthStatus {
  status: string;
  service: string;
  timestamp: string;
}

export interface DatabaseReadinessStatus {
  status: string;
  database: string;
}

export interface AiHealthStatus {
  status: string;
}

