import Anthropic from '@anthropic-ai/sdk';
import { Lead } from '@/types/lead';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

function getDaysSince(dateString: string): number {
  const date = new Date(dateString);
  const today = new Date();
  const diffTime = today.getTime() - date.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

export async function generateOutreachMessage(lead: Lead): Promise<string> {
  const daysSinceLicense = lead.license_date 
    ? getDaysSince(lead.license_date) 
    : null;

  const systemPrompt = `你是 Menusifu 的一线销售，习惯用微信跟湾区中餐厅老板沟通。写一条「第一次加好友或破冰」的短消息，不是邮件、不是公文。

必须做到：
- 简体中文，语气像真人打字：可以略带口语，但不要油、不要撒娇、不要 emoji 堆砌。
- 长度大约 160～280 字，分段最多两段，不要用 Markdown、不要编号列表、不要「一、二、三」。
- 自然点到店名和地址里的关键信息（路名/区域即可），别整段重复粘贴客户资料。
- 专业感来自「具体、克制」：最多提 1～2 个跟中餐门店真相关的点（例如中英文菜单、微信支付宝收款、跟常用外卖对接），用一句话带过，禁止排比三连、禁止堆产品说明书。
- 严禁典型 AI / 广告腔，例如：「作为……我们致力于」「 seamlessly / 无缝」「一站式解决方案」「专为像您这样的」「看到……真是太棒了」等套话；不要用「恭喜贵店」这种公文开头，可以换成更随意的开场。
- 结尾只留占位符，格式严格为：[电话] [微信]（中间空格），前面加一句很轻的邀约即可。`;

  const userPrompt = `根据下面线索写上面那条微信消息。若执照日期很近，可以随口提一句「刚看到登记/许可信息」之类，不要写得很像爬虫群发。

餐厅名：${lead.name}
地址：${lead.address || '未知'}
菜系：${lead.cuisine_type || '中餐'}
城市：${lead.city}
${daysSinceLicense !== null ? `执照/登记日期：距今约 ${daysSinceLicense} 天（仅供语气参考，不必强调天数）` : ''}

目标：让对方觉得你是活人、懂中餐店日常，愿意回一句；不提「AI」「自动生成」。`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
    system: systemPrompt,
  });

  const content = message.content[0];
  if (content.type === 'text') {
    return content.text;
  }
  
  throw new Error('Unexpected response format from Claude');
}
