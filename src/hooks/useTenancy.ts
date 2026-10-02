import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getActiveTenancyForTenant } from "@/services/tenancies.service";
import { getProperty } from "@/services/properties.service";
import { logError } from "@/services/errors";
import type { Property, Tenancy } from "@/types";

/**
 * Drives the core product-lifecycle decision described in the spec: a tenant
 * with no active tenancy sees "Find a Home" first; a tenant with one sees
 * "My Home" first. Any screen can call this instead of re-querying.
 *
 * A failed lookup is treated as "no active tenancy" (logged) so the tenant
 * home screen never hangs on a spinner because of a secondary query.
 */
export function useTenancy() {
  const { profile } = useAuth();
  const userId = profile?.id;
  const [tenancy, setTenancy] = useState<Tenancy | null | undefined>(undefined);
  const [property, setProperty] = useState<Property | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!userId) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const active = await getActiveTenancyForTenant(userId);
        if (cancelled) return;
        setTenancy(active);
        if (active) {
          const prop = await getProperty(active.propertyId);
          if (!cancelled) setProperty(prop);
        }
      } catch (e) {
        logError("useTenancy", e);
        if (!cancelled) setTenancy(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { tenancy: tenancy ?? null, property, hasActiveTenancy: !!tenancy, isLoading };
}
