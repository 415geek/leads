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

  const systemPrompt = `你是 Menusifu 的销售代表，专门服务湾区新开业的中餐厅。

写作风格：
- 用简体中文，口吻专业但亲切
- 第一句恭喜他们即将开业或新店开张
- 强调 Menusifu 专为中餐厅设计的优势（中英双语菜单、微信/支付宝支付、外卖平台对接等）
- 不超过 150 字
- 结尾留联系方式占位符 [电话] [微信]
- 不要用模板腔，要像真人发的微信消息`;

  const userPrompt = `为以下新餐厅生成一封微信开发信：

餐厅名：${lead.name}
地址：${lead.address || '未知'}
菜系：${lead.cuisine_type || '中餐'}
城市：${lead.city}
${daysSinceLicense !== null ? `执照日期：距今 ${daysSinceLicense} 天` : ''}

开发信重点：
- 恭喜新店筹备/开业
- Menusifu 是新店必备的 POS 系统
- 专为中餐厅设计，开业第一天就能用
- 提供免费演示和上门安装`;

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
