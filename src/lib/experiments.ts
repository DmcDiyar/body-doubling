// ============================================================
// Sessiz Ortak - A/B Testing / Feature Flag System
// All experiment data stored in users.metadata.experiments JSONB
// ============================================================

import { createClient } from '@/lib/supabase-client';
import { useAuthStore } from '@/stores/auth-store';
import { useEffect, useState } from 'react';

// ============================================================
// EXPERIMENT REGISTRY
// ============================================================
export const EXPERIMENTS = {
  QUEST_FOMO: {
    id: 'quest_fomo_v1',
    variants: ['control', 'treatment'] as const,
    weights: [0.5, 0.5],
  },
  SELF_COMPETITION: {
    id: 'self_comp_v1',
    variants: ['control', 'treatment'] as const,
    weights: [0.5, 0.5],
  },
  CITY_WARS: {
    id: 'city_wars_v1',
    variants: ['control', 'treatment'] as const,
    weights: [0.5, 0.5],
  },
} as const;

export type ExperimentId = (typeof EXPERIMENTS)[keyof typeof EXPERIMENTS]['id'];
export type Variant = string;

interface ExperimentAssignment {
  variant: string;
  assigned_at: string;
}

// ============================================================
// SYNC HELPER: Read variant from user metadata (no RPC)
// ============================================================
export function getVariantFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  experimentId: string
): string | null {
  if (!metadata) return null;
  const experiments = metadata.experiments as Record<string, ExperimentAssignment> | undefined;
  if (!experiments) return null;
  return experiments[experimentId]?.variant ?? null;
}

// ============================================================
// GET ALL ASSIGNMENTS FROM METADATA (for analytics injection)
// ============================================================
export function getAllAssignments(
  metadata: Record<string, unknown> | null | undefined
): Record<string, string> {
  if (!metadata) return {};
  const experiments = metadata.experiments as Record<string, ExperimentAssignment> | undefined;
  if (!experiments) return {};

  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(experiments)) {
    if (val?.variant) result[key] = val.variant;
  }
  return result;
}

// ============================================================
// REACT HOOK: useExperiment
// ============================================================
export function useExperiment(experimentId: ExperimentId): {
  variant: string | null;
  isLoading: boolean;
} {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [variant, setVariant] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    // Check local metadata first
    const existing = getVariantFromMetadata(user.metadata, experimentId);
    if (existing) {
      setVariant(existing);
      setIsLoading(false);
      return;
    }

    // Find experiment config
    const config = Object.values(EXPERIMENTS).find((e) => e.id === experimentId);
    if (!config) {
      setIsLoading(false);
      return;
    }

    // Assign via RPC
    const assign = async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc('assign_experiment', {
        p_user_id: user.id,
        p_experiment_id: experimentId,
        p_variants: config.variants as unknown as string[],
        p_weights: config.weights as unknown as number[],
      });

      if (data) {
        setVariant(data as string);

        // Update local user metadata to avoid re-fetching
        const updatedMetadata = {
          ...user.metadata,
          experiments: {
            ...(user.metadata?.experiments as Record<string, unknown> ?? {}),
            [experimentId]: { variant: data, assigned_at: new Date().toISOString() },
          },
        };
        setUser({ ...user, metadata: updatedMetadata });
      }

      setIsLoading(false);
    };

    assign();
  }, [user?.id, experimentId]);

  return { variant, isLoading };
}
