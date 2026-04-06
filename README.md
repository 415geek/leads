# MenusifuLeads

湾区中餐厅 POS 销售获客系统 — 自动发现新开张餐厅，生成精准 leads。

## 技术栈

- **前端**: Next.js 14 (App Router) + Tailwind CSS + shadcn/ui
- **后端**: Next.js API Routes
- **数据库**: Supabase (PostgreSQL)
- **AI**: Anthropic Claude API (开发信生成)
- **部署**: Vercel

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env.local`，填入以下配置：

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Anthropic
ANTHROPIC_API_KEY=your_anthropic_key

# n8n Webhook 密钥
N8N_WEBHOOK_SECRET=your_webhook_secret
```

### 3. 创建数据库表

在 Supabase SQL 编辑器中运行 `supabase/schema.sql`。

### 4. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

## 功能模块

### Dashboard
- 统计卡片：总 leads、本周新增、热门 leads、已成交
- 最新 leads 列表

### Leads 列表
- 按评分排序
- 按城市/状态筛选
- 搜索餐厅名

### Lead 详情
- 基本信息查看
- 状态更新
- 备注管理
- AI 开发信生成

## API 接口

```
GET  /api/leads              # 获取列表（支持分页、筛选）
POST /api/leads/upsert       # n8n 批量导入
GET  /api/leads/[id]         # 获取单个详情
PATCH /api/leads/[id]        # 更新状态/备注
POST /api/leads/generate     # 生成开发信
```

## n8n 集成

通过 POST `/api/leads/upsert` 接口导入数据，需要设置 `x-webhook-secret` header。

```json
POST /api/leads/upsert
Header: x-webhook-secret: your_secret
Body: {
  "leads": [
    {
      "name": "金龙餐厅",
      "address": "123 Main St, SF",
      "cuisine_type": "粤菜",
      "license_date": "2024-01-15"
    }
  ]
}
```

## 部署

```bash
vercel
```

## 许可

Private - 内部使用
