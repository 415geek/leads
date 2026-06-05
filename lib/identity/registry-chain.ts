import { entityNamesMatch } from '@/lib/identity/normalize';
import type { IdentityNameHit } from '@/lib/identity/types';

export interface RegistryChainResolution {
  entityName: string;
  personName: string;
  officerPosition: string | null;
}

/**
 * DataSF ownership_name + OpenCorporates 同实体高管 → 可确认自然人老板（无需第二自然人源）。
 */
export function resolveOwnerFromRegistryChain(
  hits: readonly IdentityNameHit[],
): RegistryChainResolution | null {
  const gov = hits.find(
    (h) =>
      h.entityName?.trim() &&
      h.rawPayload &&
      typeof h.rawPayload === 'object' &&
      (h.rawPayload as { from?: string }).from === 'ownership_name',
  );
  const oc = hits.find(
    (h) => h.source === 'opencorporates' && h.personName?.trim() && h.entityName?.trim(),
  );
  if (!gov?.entityName || !oc?.personName || !oc.entityName) return null;
  if (!entityNamesMatch(gov.entityName, oc.entityName)) return null;

  const position =
    oc.rawPayload &&
    typeof oc.rawPayload === 'object' &&
    typeof (oc.rawPayload as { position?: string }).position === 'string'
      ? (oc.rawPayload as { position: string }).position
      : null;

  return {
    entityName: gov.entityName.trim(),
    personName: oc.personName.trim(),
    officerPosition: position,
  };
}
