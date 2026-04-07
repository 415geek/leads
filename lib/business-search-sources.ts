/**
 * Dashboard「商业搜索」：生成对外部政府门户与公开网络的搜索链接。
 * 多数站点为 SPA 或需二次筛选，链接尽量带上 query；无法带参时打开门户首页并提示站内搜索。
 */

export type BusinessSearchCategoryId = 'sos' | 'bay_open_data' | 'news_social';

export interface BusinessSearchCategory {
  id: BusinessSearchCategoryId;
  title: string;
  description: string;
}

export interface BusinessSearchLink {
  id: string;
  label: string;
  description: string;
  url: string;
  category: BusinessSearchCategoryId;
  /**
   * 点击打开链接时写入剪贴板（用于官方站点不支持 URL 预填时，如 CA BizFile）。
   * 需在用户点击的同一次手势内调用，以避免被浏览器拦截。
   */
  clipboardTextOnOpen?: string;
}

const CATEGORIES: BusinessSearchCategory[] = [
  {
    id: 'sos',
    title: '加州州务卿（企业登记）',
    description: 'LLC/Corp 注册、Statement of Information 等；部分页面需在站内再点搜索。',
  },
  {
    id: 'bay_open_data',
    title: '湾区城市开放数据与政务检索',
    description: '各市政府开放数据门户（许可、执法、地理等数据集因城市而异，需在站内筛选）。',
  },
  {
    id: 'news_social',
    title: '新闻与社交媒体',
    description: '公开网页与社交平台上的名称检索（结果由第三方提供，请注意甄别）。',
  },
];

function enc(s: string): string {
  return encodeURIComponent(s.trim());
}

/** 组合「店名 + 城市」提高命中率 */
function coreQuery(name: string, city?: string): string {
  const n = name.trim();
  const c = city?.trim();
  if (!n) return '';
  return c ? `${n} ${c}` : n;
}

function withRestaurantContext(q: string): string {
  const t = q.trim();
  if (!t) return '';
  return `${t} restaurant California`;
}

export function buildBusinessSearchLinks(
  businessName: string,
  options?: { city?: string; enrichWithRestaurant?: boolean }
): { categories: BusinessSearchCategory[]; links: BusinessSearchLink[] } {
  const city = options?.city?.trim();
  const base = coreQuery(businessName, city);
  const enriched = options?.enrichWithRestaurant ? withRestaurantContext(coreQuery(businessName, city)) : base;

  if (!base) {
    return { categories: CATEGORIES, links: [] };
  }

  const q = enc(base);
  const qEnriched = enc(enriched);
  const qNameOnly = enc(businessName.trim());

  const links: BusinessSearchLink[] = [
    {
      id: 'ca-sos-bizfile',
      label: 'CA BizFile Online（企业搜索入口）',
      description:
        'California Secretary of State 官方企业查询。点击卡片时会自动把上方填写的企业名复制到剪贴板；BizFile 打开后在搜索框粘贴（Cmd/Ctrl+V）即可检索。',
      url: 'https://bizfileonline.sos.ca.gov/search/business',
      category: 'sos',
      clipboardTextOnOpen: businessName.trim(),
    },
    {
      id: 'ca-sos-search-google',
      label: 'Google：site:sos.ca.gov + 企业名',
      description: '用搜索引擎在州务卿相关站内页面中缩小范围（非官方，仅供参考）。',
      url: `https://www.google.com/search?q=${enc(`site:sos.ca.gov OR site:bizfileonline.sos.ca.gov ${businessName.trim()} ${city || ''}`)}`,
      category: 'sos',
    },
    {
      id: 'sf-data',
      label: 'DataSF（旧金山开放数据）',
      description: '浏览/搜索数据集：许可、地理、健康评分等可能分属不同 dataset。',
      url: `https://data.sfgov.org/browse?q=${q}`,
      category: 'bay_open_data',
    },
    {
      id: 'oakland-data',
      label: 'Oakland Open Data',
      description: '奥克兰市开放数据目录搜索。',
      url: `https://data.oaklandca.gov/browse?q=${q}`,
      category: 'bay_open_data',
    },
    {
      id: 'sanjose-data',
      label: 'San José Open Data',
      description: '圣何塞开放数据目录搜索。',
      url: `https://data.sanjoseca.gov/browse?q=${q}`,
      category: 'bay_open_data',
    },
    {
      id: 'berkeley-data',
      label: 'City of Berkeley Open Data',
      description: '伯克利开放数据（Socrata）。',
      url: `https://data.cityofberkeley.info/browse?q=${q}`,
      category: 'bay_open_data',
    },
    {
      id: 'acgov-data',
      label: 'Alameda County Open Data',
      description: '阿拉米达县开放数据（含东湾多市相关数据集，需在站内筛选）。',
      url: `https://data.acgov.org/browse?q=${q}`,
      category: 'bay_open_data',
    },
    {
      id: 'smcgov-data',
      label: 'San Mateo County Open Data',
      description: '圣马特奥县开放数据（半岛区域）。',
      url: `https://data.smcgov.org/browse?q=${q}`,
      category: 'bay_open_data',
    },
    {
      id: 'google-bay-gov',
      label: 'Google：湾区政务站点（粗筛）',
      description: '限制在常见 .gov 子域，用于找公示、议会材料等（结果需自行甄别）。',
      url: `https://www.google.com/search?q=${enc(`${businessName.trim()} ${city || ''} (site:sf.gov OR site:sfgov.org OR site:oaklandca.gov OR site:sanjoseca.gov OR site:cityofberkeley.info OR site:acgov.org OR site:smcgov.org)`)}`,
      category: 'bay_open_data',
    },
    {
      id: 'google-news',
      label: 'Google News',
      description: '新闻聚合搜索。',
      url: `https://news.google.com/search?q=${qEnriched}&hl=en-US&gl=US&ceid=US:en`,
      category: 'news_social',
    },
    {
      id: 'google-web',
      label: 'Google 网页',
      description: '通用网页搜索。',
      url: `https://www.google.com/search?q=${qEnriched}`,
      category: 'news_social',
    },
    {
      id: 'duckduckgo',
      label: 'DuckDuckGo',
      description: '隐私向综合搜索。',
      url: `https://duckduckgo.com/?q=${qEnriched}`,
      category: 'news_social',
    },
    {
      id: 'yelp',
      label: 'Yelp（湾区）',
      description: '商户评价与基本信息；find_loc 可按需改城市。',
      url: `https://www.yelp.com/search?find_desc=${qNameOnly}&find_loc=${enc(city || 'San Francisco Bay Area')}`,
      category: 'news_social',
    },
    {
      id: 'x-twitter',
      label: 'X（Twitter）搜索',
      description: '公开帖文搜索。',
      url: `https://x.com/search?q=${q}&src=typed_query&f=live`,
      category: 'news_social',
    },
    {
      id: 'linkedin',
      label: 'LinkedIn 关键词搜索',
      description: '公司/人员公开档案（需登录时以平台为准）。',
      url: `https://www.linkedin.com/search/results/all/?keywords=${q}`,
      category: 'news_social',
    },
    {
      id: 'facebook',
      label: 'Facebook 搜索',
      description: '公开主页与帖文（需登录时以平台为准）。',
      url: `https://www.facebook.com/search/top?q=${q}`,
      category: 'news_social',
    },
    {
      id: 'instagram-google',
      label: 'Google：Instagram 相关内容',
      description: '通过网页搜索定位可能的 IG 主页或标签（IG 深链受限）。',
      url: `https://www.google.com/search?q=${enc(`site:instagram.com ${businessName.trim()} ${city || ''}`)}`,
      category: 'news_social',
    },
  ];

  return { categories: CATEGORIES, links };
}

export function groupLinksByCategory(links: BusinessSearchLink[]): Map<BusinessSearchCategoryId, BusinessSearchLink[]> {
  const map = new Map<BusinessSearchCategoryId, BusinessSearchLink[]>();
  for (const c of CATEGORIES) {
    map.set(c.id, []);
  }
  for (const link of links) {
    map.get(link.category)?.push(link);
  }
  return map;
}
