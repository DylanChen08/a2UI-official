# A2UI 项目长期记忆

## 项目概况
- A2UI Playground：AI to UI 项目，用户通过对话让 AI 生成 UI 界面
- Monorepo 结构（pnpm），包含 packages/a2ui-core、packages/a2ui-react、web/a2ui-playground、server/a2ui-playground-server

## 服务器信息
- IP: 106.52.246.40, 用户: ubuntu, 系统: Ubuntu 24.04 LTS
- 前端: /var/www/a2ui/ (nginx, 端口80)
- 后端: /home/ubuntu/a2ui-server/ (PM2 a2ui-server, 端口3847)
- 考勤: /home/ubuntu/yadan/ (PM2 yadan-report, 端口3456)

## 构建注意事项
- a2ui-react tsc 构建会报错 Cannot find module 'a2ui-core'，前端需用 vite build 直接构建
- 后端 tsc 增量编译可能导致部分文件（如 mockStream.js）不生成，需删除 dist/ 和 .tsbuildinfo 后强制重编
- tsconfig include 改为 ["src"]（原来是 ["src/**/*"]）

## 服务器依赖文件（部署时必须上传）
- `/home/docs/` — 协议目录文件（server_to_client_with_standard_catalog.json + catalog_definition.json），protocolBundle.ts 通过 `__dirname` 相对路径 `../../../../docs` 读取
- `/home/packages/a2ui-core/mock/` — mock 数据文件（仅 mock 模式需要，LLM 模式不需要）
