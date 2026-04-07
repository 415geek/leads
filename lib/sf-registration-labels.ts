/** SF Open Data g8m3-pdis（Business Registration）常见字段 → 中文展示名 */
export const SF_REGISTRATION_LABELS: Record<string, string> = {
  uniqueid: '唯一编号',
  certificate_number: '证书号',
  ttxid: '税务交易 ID',
  ownership_name: '法人/业主名称',
  business_name: '企业注册名',
  dba_name: '经营字号 (DBA)',
  full_business_address: '经营地址',
  city: '城市',
  state: '州',
  business_zip: '邮编',
  dba_start_date: 'DBA 开始日期',
  dba_end_date: 'DBA 结束日期',
  location_start_date: '经营场所开始日期',
  location_end_date: '经营场所结束日期',
  administratively_closed: '行政关闭',
  mailing_address_1: '邮寄地址',
  mail_city: '邮寄城市',
  mail_state: '邮寄州',
  mail_zipcode: '邮寄邮编',
  naic_code: 'NAICS 代码',
  naic_code_description: 'NAICS 行业说明',
  naics_code_descriptions_list: 'NAICS 说明列表',
  lic: '执照代码',
  lic_code_description: '执照类型说明',
  lic_code_descriptions_list: '执照类型列表',
  parking_tax: '停车税',
  transient_occupancy_tax: '短期住宿税',
  location: '地理坐标 (GeoJSON)',
  business_corridor: '商业走廊',
  neighborhoods_analysis_boundaries: '社区/街区',
  supervisor_district: '市议员选区',
  community_benefit_district: '社区利益区',
  data_as_of: '数据截止日期',
  data_loaded_at: '数据加载时间',
  business_phone: '登记电话',
};

export function labelForSourceKey(key: string): string {
  if (key.startsWith(':')) return key;
  return SF_REGISTRATION_LABELS[key] ?? key;
}
