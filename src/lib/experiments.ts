'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-client';
import { useAuthStore } from '@/stores/auth-store';

// ============================================================
// Experiment Registry
// ============================================================
export const EXPERIMENTS = {
  QUEST_FOMO: {
    id: 'quest_fomo',
    variants: ['control', 'treatment'],
    weights: [0.5, 0.5],
    description: 'Mystery quest reveals + FOMO messages',
  },
  SELF_COMPETITION: {
    id: 'self_competition',
    variants: ['control', 'treatment'],
    weights: [0.5, 0.5],
    description: 'Self-competition panel with trends',
  },
} as const;

export type ExperimentId = (typeof EXPERIMENTS)[keyof typeof EXPERIMENTS]['id'];

// ============================================================
// Helpers
// ============================================================

/** Sync helper: read variant from user metadata (no RPC call) */
export function getVariantFromMetadata(
  metadata: Record<string, unknown> | undefined | null,
  experimentId: string
): string | null {
  if (!metadata) return null;
  const experiments = metadata.experiments as Record<string, string> | undefined;
  return experiments?.[experimentId] ?? null;
}

/** Get all experiment assignments from metadata */
export function getAllAssignments(
  metadata: Record<string, unknown> | undefined | null
): Record<string, string> {
  if (!metadata) return {};
  return (metadata.experiments as Record<string, string>) ?? {};
}

/** Check if user is in treatment group */
export function isTreatment(
  metadata: Record<string, unknown> | undefined | null,
  experimentId: string
): boolean {
  return getVariantFromMetadata(metadata, experimentId) === 'treatment';
}

// ============================================================
// React Hook
// ============================================================

/**
 * Hook to get experiment variant.
 * Checks local metadata first, falls back to RPC assignment.
 */
export function useExperiment(experimentId: ExperimentId): {
  variant: string | null;
  isLoading: boolean;
  isTreatment: boolean;
} {
  const user = useAuthStore((s) => s.user);
  const [variant, setVariant] = useState<string | null>(() =>
    getVariantFromMetadata(user?.metadata, experimentId)
  );
  const [isLoading, setIsLoading] = useState(!variant);

  useEffect(() => {
    // Already have variant from metadata
    const cached = getVariantFromMetadata(user?.metadata, experimentId);
    if (cached) {
      setVariant(cached);
      setIsLoading(false);
      return;
    }

    if (!user?.id) return;

    // Assign via RPC
    const assign = async () => {
      const exp = Object.values(EXPERIMENTS).find((e) => e.id === experimentId);
      if (!exp) return;

      const supabase = createClient();
      const { data } = await supabase.rpc('assign_experiment', {
        p_user_id: user.id,
        p_experiment_id: experimentId,
        p_variants: exp.variants as unknown as string[],
        p_weights: exp.weights as unknown as number[],
      });

      if (data) {
        setVariant(data as string);
      }
      setIsLoading(false);
    };

    assign();
  }, [user?.id, user?.metadata, experimentId]);

  return {
    variant,
    isLoading,
    isTreatment: variant === 'treatment',
  };
}
