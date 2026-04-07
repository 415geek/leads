/** Dashboard 商业搜索 query：与 BusinessSearchPanel 约定一致 */

export const DASHBOARD_BIZ_QUERY = 'biz';
export const DASHBOARD_BIZ_CITY_QUERY = 'bizCity';

export function dashboardBusinessSearchHref(
  businessName: string,
  city?: string | null
): string {
  const p = new URLSearchParams();
  p.set(DASHBOARD_BIZ_QUERY, businessName.trim());
  const c = city?.trim();
  if (c) p.set(DASHBOARD_BIZ_CITY_QUERY, c);
  return `/?${p.toString()}`;
}
