import { useCallback, useEffect, useState } from 'react';
import { defaultBranding } from '../config/branding';
import { ApiClientError } from '../services/api/client';
import {
  getAiHealth,
  getApiHealth,
  getBranding,
  getReadinessHealth,
} from '../services/api/system';
import type {
  AiHealthStatus,
  ApiHealthStatus,
  DatabaseReadinessStatus,
  PublicBranding,
} from '../types/api';

export interface ProbeState<T> {
  status: 'loading' | 'ok' | 'error';
  data: T | null;
  errorMessage: string | null;
  errorCode: string | null;
}

export interface SystemStatusState {
  branding: PublicBranding;
  brandingSynced: boolean;
  api: ProbeState<ApiHealthStatus>;
  database: ProbeState<DatabaseReadinessStatus>;
  ai: ProbeState<AiHealthStatus>;
  lastCheckedAt: string | null;
}

function initialProbe<T>(): ProbeState<T> {
  return {
    status: 'loading',
    data: null,
    errorMessage: null,
    errorCode: null,
  };
}

function toProbeResult<T>(settled: PromiseSettledResult<T>): ProbeState<T> {
  if (settled.status === 'fulfilled') {
    return {
      status: 'ok',
      data: settled.value,
      errorMessage: null,
      errorCode: null,
    };
  }

  const reason = settled.reason;

  if (reason instanceof ApiClientError) {
    return {
      status: 'error',
      data: null,
      errorMessage: reason.message,
      errorCode: reason.code,
    };
  }

  return {
    status: 'error',
    data: null,
    errorMessage: 'Unexpected error while checking service status.',
    errorCode: 'UNKNOWN_ERROR',
  };
}

export function useSystemStatus() {
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [state, setState] = useState<SystemStatusState>(() => ({
    branding: defaultBranding,
    brandingSynced: false,
    api: initialProbe<ApiHealthStatus>(),
    database: initialProbe<DatabaseReadinessStatus>(),
    ai: initialProbe<AiHealthStatus>(),
    lastCheckedAt: null,
  }));

  const refresh = useCallback(() => {
    setState((previous) => ({
      ...previous,
      api: initialProbe<ApiHealthStatus>(),
      database: initialProbe<DatabaseReadinessStatus>(),
      ai: initialProbe<AiHealthStatus>(),
    }));
    setRefreshIndex((count) => count + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      const [brandingResult, apiResult, databaseResult, aiResult] = await Promise.allSettled([
        getBranding(controller.signal),
        getApiHealth(controller.signal),
        getReadinessHealth(controller.signal),
        getAiHealth(controller.signal),
      ]);

      if (controller.signal.aborted) {
        return;
      }

      setState({
        branding:
          brandingResult.status === 'fulfilled' ? brandingResult.value : defaultBranding,
        brandingSynced: brandingResult.status === 'fulfilled',
        api: toProbeResult(apiResult),
        database: toProbeResult(databaseResult),
        ai: toProbeResult(aiResult),
        lastCheckedAt: new Date().toISOString(),
      });
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [refreshIndex]);

  return {
    ...state,
    refresh,
  };
}

