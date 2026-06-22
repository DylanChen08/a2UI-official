A2UI Playground 界面优化与 Codex 改造需求文档

0. 改造要求：必须使用 ui-ux-pro-max-skill

本项目使用 React + Ant Design，后续交给 Codex 改造时，建议明确要求：

Codex 必须先读取并使用 ui-ux-pro-max-skill 作为 UI/UX 改造参考，再基于当前项目现有代码进行增量改造，不允许推倒重写。

可引用的工具来源：

* nextlevelbuilder/ui-ux-pro-max-skill 是一个面向多平台、多框架的 UI/UX 设计智能 Skill。 
* 官方站点说明它适用于 Claude Code，包含 UI 风格、配色、字体组合和 UX 指南等设计知识库。 

建议在 Codex 任务里写死这一条：

你必须结合以下 UI/UX Skill 的设计原则进行改造：
https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
https://ui-ux-pro-max-skill.nextlevelbuilder.io/
请先阅读该 Skill 的设计方法，再审查当前 React + Ant Design 项目代码。
改造时必须保持现有业务逻辑、A2UI 渲染逻辑、SSE 流式接收逻辑、Mock 场景逻辑不被破坏。

⸻

1. 当前界面总体判断

当前界面已经具备 Playground 的核心功能：

左侧：Agent 对话 / Mock 场景选择 / 输入区
右侧：A2UI 预览区
顶部：Store / Errors / JSON / 本地 Mock 流调试入口
弹窗：Store State / Errors / A2UI JSON

但是从产品体验看，目前仍然偏 开发调试页面，还没有形成一个成熟的 A2UI Playground 工作台。

主要问题集中在：

1. 信息层级弱，左侧内容堆叠感较强
2. 顶部按钮过多，调试入口分散
3. 预览区空白过大，内容没有形成工作台质感
4. Store / Errors / JSON 弹窗体验割裂
5. 生成状态、错误状态、成功状态不够清晰
6. Ant Design 组件使用较基础，缺少统一视觉系统
7. 缺少示例、历史、复制、导出等 Playground 常用能力

⸻

2. 样式层面优化建议

2.1 左侧 Agent 面板需要重新分区

当前问题

左侧栏现在包含：

Agent 对话
仅模型对话 Switch
说明文字
本地 Mock 流说明
场景选择器
生成按钮
Agent 完成状态
模型输出抽屉
输入框
附加图片
发送按钮

这些内容都放在同一个窄栏里，视觉层级不够明确。

建议改成三段式结构

顶部：模式与场景配置
中部：会话记录 / 生成记录
底部：Prompt 输入区

建议结构：

┌────────────────────────────┐
│ Agent Playground            │
│ 当前模式：本地 Mock          │
├────────────────────────────┤
│ 运行配置                    │
│ 数据来源：Agent / Mock       │
│ 场景：统计页 / 表单页         │
│ [生成示例页面]               │
├────────────────────────────┤
│ 生成记录                    │
│ ✓ 统计概览页 已完成          │
│ ✕ 表单页 JSON 解析失败       │
├────────────────────────────┤
│ 输入 Prompt                 │
│ [输入框]                    │
│ [上传图片]        [发送]     │
└────────────────────────────┘

⸻

2.2 左侧文字太密，技术说明应收纳

当前问题

左侧存在较多技术说明，例如：

右侧预览会附上一轮协议 JSON
服务端将 JSON 视为 CUSTOM / a2ui.jsonl.chunk 流式推送

这些内容对开发者有用，但默认全部展示，会降低界面清爽度。

优化建议

将技术说明折叠到 Tooltip / Collapse / Help Icon 中。

示例：

<Typography.Text strong>本地 Mock 流</Typography.Text>
<Tooltip title="通过 /api/agent 模拟多轮协议输出，适合本地调试。">
  <QuestionCircleOutlined />
</Tooltip>

默认只展示：

本地 Mock 流
通过本地场景生成 A2UI 页面

详细协议说明点击后再看。

⸻

2.3 右侧预览区需要从“空画布”变成“工作台”

当前问题

右侧预览区虽然很大，但内容区域比较松散。
统计卡片或表单生成后，周围空白过大，用户容易觉得页面没有完成。

优化建议

将右侧预览区改成完整工作台：

┌──────────────────────────────────────────────┐
│ Preview                                      │
│ 实时渲染 Agent 输出的 A2UI 页面               │
│ 状态：已完成 / 流式生成中 / 渲染失败           │
├──────────────────────────────────────────────┤
│                                              │
│              A2UI 渲染内容                    │
│                                              │
└──────────────────────────────────────────────┘

预览区外层建议：

background: #f5f7fb;
border: 1px solid #e5e7eb;
border-radius: 12px;
padding: 24px;

内部画布建议：

background: #ffffff;
border-radius: 12px;
box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
min-height: calc(100vh - 160px);

⸻

2.4 顶部按钮需要统一成“调试工具栏”

当前问题

顶部现在是：

View Store | View Errors | View A2UI JSON | 本地 Mock 流

问题是：

1. 按钮语义偏英文，与左侧中文界面不统一
2. View Store 是蓝色主按钮，抢占主操作视觉
3. Errors 即使没有错误也一直红色边框，容易造成误导
4. 本地 Mock 流像按钮，但实际更像状态

优化建议

统一为调试工具栏：

运行模式：本地 Mock    状态：已完成    组件数：13
[预览] [JSON] [Store] [Errors 0]

按钮文案建议中文化：

查看 Store → 状态树
View Errors → 错误
View A2UI JSON → 协议 JSON
本地 Mock 流 → Mock 模式

错误按钮规则：

Errors 0：灰色普通按钮
Errors > 0：红色危险按钮 + 数字 Badge

Ant Design 示例：

<Badge count={errorCount} size="small">
  <Button danger={errorCount > 0}>错误</Button>
</Badge>

⸻

2.5 弹窗样式需要增强可读性

当前问题

Store、Errors、JSON 都使用弹窗展示，但当前弹窗存在几个问题：

1. 弹窗尺寸不统一
2. JSON 内容阅读压力大
3. 缺少复制按钮
4. 缺少格式化、折叠、搜索能力
5. 弹窗遮罩后仍能看到复杂背景，干扰阅读

优化建议

调试弹窗建议升级为 Drawer 或右侧面板。

推荐方案：

右侧调试 Drawer
├─ Tab：JSON
├─ Tab：Store
└─ Tab：Errors

优点：

1. 不遮挡主预览区太多
2. 更符合开发者工具习惯
3. 可以长期打开，一边预览一边看 JSON
4. 适合展示大段结构化数据

Ant Design 建议使用：

<Drawer width={640} placement="right">
  <Tabs items={[
    { key: 'json', label: '协议 JSON' },
    { key: 'store', label: '状态树' },
    { key: 'errors', label: '错误' },
  ]} />
</Drawer>

⸻

3. 交互层面优化建议

3.1 “仅模型对话”和“本地 Mock 流”概念容易混淆

当前问题

界面同时出现：

仅模型对话
本地 Mock 流
Agent back

用户不容易判断：

到底当前是调用真实 Agent？
还是使用本地 Mock？
还是只进行普通模型对话？

优化建议

改成一个明确的运行模式选择：

运行模式
○ Agent 实时生成
● 本地 Mock 场景
○ 仅模型对话

或者使用 Segmented：

<Segmented
  options={[
    { label: 'Agent', value: 'agent' },
    { label: 'Mock', value: 'mock' },
    { label: 'Chat', value: 'chat' },
  ]}
/>

这样比多个分散开关更清楚。

⸻

3.2 场景选择器需要增加解释

当前问题

当前下拉项类似：

Agent back（测试列-文本-按钮）

对开发者可能明白，但对使用者不够直观。

优化建议

每个场景增加描述：

统计概览页
生成 KPI 卡片、刷新按钮和基础布局
用户信息表单
生成统计信息、填写信息和提交按钮
复杂嵌套树
测试多层嵌套组件与状态更新

可以在选择器下方显示当前场景说明：

当前场景：用户统计信息
用于测试 Card、Statistic、Form、Button 等基础组件渲染。

⸻

3.3 生成按钮需要有 Loading 状态

当前问题

点击“生成一个统计表单页面”后，左侧虽然有 Agent 完成信息，但按钮本身缺少明显状态反馈。

优化建议

按钮状态应包括：

默认：生成统计表单页面
生成中：正在生成...
成功：生成完成
失败：重新生成

Ant Design 示例：

<Button type="primary" loading={isGenerating}>
  {isGenerating ? '正在生成...' : '生成统计表单页面'}
</Button>

⸻

3.4 输入框应强化 Prompt 能力

当前问题

底部输入框现在像普通聊天输入框，但这个产品的本质是 A2UI 生成工具。
因此输入区应该更像 Prompt 控制台。

优化建议

输入区改成：

输入 A2UI 生成需求
[ 请描述你想生成的页面、组件或交互... ]
快捷示例：
[生成统计页] [生成表单] [生成 Dashboard] [生成错误状态]
[上传图片] [清空] [发送]

建议增加 Prompt 示例 Chips：

<Space wrap>
  <Tag onClick={() => setPrompt('生成一个用户统计信息页面')}>统计页</Tag>
  <Tag onClick={() => setPrompt('生成一个用户信息表单')}>表单</Tag>
  <Tag onClick={() => setPrompt('生成一个设备监控 Dashboard')}>Dashboard</Tag>
</Space>

⸻

3.5 错误反馈不能只藏在弹窗里

当前问题

当前点击 View Errors 才能看到错误。
如果生成失败，左侧虽然提示“未完成”，但右侧预览区没有强提示。

优化建议

错误应该在三个地方同步出现：

1. 左侧生成记录：显示失败原因摘要
2. 顶部 Errors：显示 Badge 数量
3. 右侧预览区：显示错误状态卡片

右侧错误卡片示例：

渲染失败
模型输出不是合法 A2UI JSON。
建议检查：
1. 是否包含 beginRendering
2. 是否包含 surfaceUpdate
3. JSON 字段是否完整
[查看 JSON] [查看错误详情] [重新生成]

⸻

3.6 Store / JSON / Errors 建议改成常驻调试面板

当前问题

三个调试功能都用弹窗，会导致用户操作路径变长：

点击按钮 → 打开弹窗 → 查看 → 关闭 → 回到预览

开发者调试时会频繁切换，效率不高。

推荐交互

右侧主区域改成：

[Preview] [JSON] [Store] [Errors]

或者：

左边预览，右边 Inspector

推荐布局：

┌──────────────────────────────┬────────────────────┐
│ Preview                      │ Inspector          │
│                              │ JSON / Store/Error │
└──────────────────────────────┴────────────────────┘

这会更像专业调试工具。

⸻

4. React + Ant Design 改造建议

4.1 建议使用 Ant Design Layout 重构主框架

当前页面可以整理成：

<Layout className="app-shell">
  <Sider width={340}>
    <AgentPanel />
  </Sider>
  <Layout>
    <Header>
      <TopToolbar />
    </Header>
    <Content>
      <Workspace />
    </Content>
  </Layout>
</Layout>

组件建议拆分：

src/
├─ components/
│  ├─ AgentPanel/
│  ├─ TopToolbar/
│  ├─ PreviewCanvas/
│  ├─ DebugDrawer/
│  ├─ JsonViewer/
│  ├─ ErrorPanel/
│  └─ StoreViewer/
├─ hooks/
│  ├─ useAgentStream.ts
│  ├─ useA2UIStore.ts
│  └─ useDebugPanel.ts
└─ styles/
   └─ tokens.ts

⸻

4.2 建立统一 Design Token

建议不要到处写死颜色和间距。
用 Ant Design ConfigProvider 统一主题。

<ConfigProvider
  theme={{
    token: {
      colorPrimary: '#1677ff',
      colorBgLayout: '#f5f7fb',
      colorBorder: '#e5e7eb',
      borderRadius: 10,
      fontSize: 14,
    },
    components: {
      Button: {
        borderRadius: 8,
        controlHeight: 34,
      },
      Card: {
        borderRadiusLG: 12,
      },
    },
  }}
>
  <App />
</ConfigProvider>

推荐视觉参数：

主色：#1677FF
页面背景：#F5F7FB
侧栏背景：#FFFFFF
卡片背景：#FFFFFF
边框：#E5E7EB
主文字：#1F2937
次级文字：#6B7280
弱提示：#9CA3AF
成功色：#22C55E
错误色：#EF4444
警告色：#F59E0B
圆角：8 / 12
间距：8 / 12 / 16 / 24

⸻

4.3 JSON 查看器建议升级

当前 JSON 是纯文本展示，阅读效率低。

建议增加：

1. 格式化 JSON
2. 复制 JSON
3. 搜索字段
4. 折叠层级
5. 高亮错误位置

如果不引入复杂库，至少增加：

<Button onClick={copyJson}>复制 JSON</Button>
<Input.Search placeholder="搜索字段，例如 component / props / id" />
<pre>{formattedJson}</pre>

⸻

4.4 预览区组件需要有选中态

当前提示支持：

Ctrl/⌘ + 点击元素可将组件 id 写入左侧输入框

这个能力很好，但视觉反馈不够。

建议增加：

1. Hover 时显示浅蓝描边
2. Ctrl/⌘ + 点击后显示选中蓝框
3. 右侧 Inspector 显示组件 id、type、props

交互示意：

选中组件
ID: submit-button
Type: Button
Path: root.children[3]
Props:
{
  "text": "提交",
  "type": "primary"
}

⸻

5. 页面内容本身的 UI 优化建议

5.1 统计卡片页面

当前统计卡片存在：

1. 卡片过小
2. 指标之间距离过散
3. 标题和内容层级不够
4. 刷新按钮位置略突兀

建议改成：

┌──────────────────────────────────────────────┐
│ 统计概览                         更新时间：刚刚 │
├──────────────────────────────────────────────┤
│ 用户总数      订单数       营收        增长率   │
│ 12,580       3,420       86.5万      +23.4%  │
│                                              │
│                              [刷新数据]       │
└──────────────────────────────────────────────┘

建议使用 Ant Design：

<Card>
  <Row gutter={16}>
    <Col span={6}><Statistic title="用户总数" value={12580} /></Col>
    <Col span={6}><Statistic title="订单数" value={3420} /></Col>
    <Col span={6}><Statistic title="营收" value={86.5} suffix="万" /></Col>
    <Col span={6}><Statistic title="增长率" value={23.4} suffix="%" /></Col>
  </Row>
</Card>

⸻

5.2 表单页面

当前表单页面的问题：

1. 字段标签在左，值在右，中间距离太大
2. 看起来不像可编辑表单，更像详情页
3. 提交按钮过宽，视觉过重
4. 页面上半部分留白不均匀

如果这是“信息展示 + 提交”，建议改成详情卡片：

用户统计信息
[总用户 12,580] [订单数 3,420] [收入 ¥89,600]
填写信息
姓名：张三
邮箱：zhangsan@example.com
年龄：28
右下角：[提交]

如果这是“表单”，建议用 Ant Design Form：

<Form layout="vertical">
  <Form.Item label="姓名">
    <Input value="张三" />
  </Form.Item>
  <Form.Item label="邮箱">
    <Input value="zhangsan@example.com" />
  </Form.Item>
  <Form.Item label="年龄">
    <InputNumber value={28} />
  </Form.Item>
  <Button type="primary">提交</Button>
</Form>

⸻

6. 建议 Codex 执行的改造任务

下面这段可以直接复制给 Codex。

# Codex 改造任务：A2UI Playground UI/UX 升级
你是资深 React + Ant Design 前端工程师，同时需要使用 ui-ux-pro-max-skill 进行 UI/UX 改造。
## 必须遵守
1. 必须先阅读并参考：
   - https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
   - https://ui-ux-pro-max-skill.nextlevelbuilder.io/
2. 必须结合 ui-ux-pro-max-skill 的设计方法，对当前界面进行 UI/UX 级别改造。
3. 当前项目技术栈是 React + Ant Design，不允许换技术栈。
4. 不允许推倒重写，不允许破坏现有业务逻辑。
5. 必须保留：
   - A2UI 渲染逻辑
   - Agent 对话逻辑
   - SSE 流式接收逻辑
   - 本地 Mock 场景逻辑
   - View Store / View Errors / View A2UI JSON 调试能力
   - Ctrl/⌘ + 点击元素写入组件 id 的能力
## 改造目标
把当前页面从“开发调试页面”升级为“专业 A2UI Playground 工作台”。
## 重点改造内容
### 1. 主布局改造
使用 Ant Design Layout 重构：
- 左侧固定 Agent Panel，宽度 320-360px
- 右侧为 Workspace
- 顶部为 TopToolbar
- 主内容为 PreviewCanvas
- 调试信息使用 DebugDrawer 或 Tabs 展示
建议组件结构：
src/components/AgentPanel
src/components/TopToolbar
src/components/PreviewCanvas
src/components/DebugDrawer
src/components/JsonViewer
src/components/ErrorPanel
src/components/StoreViewer
### 2. 左侧 Agent Panel 改造
左侧分成：
- 运行配置
- 场景选择
- 生成记录
- Prompt 输入区
需要降低说明文字噪音，把技术说明放入 Tooltip 或 Collapse。
### 3. 顶部工具栏改造
把顶部按钮统一成调试工具栏：
- 状态树
- 错误
- 协议 JSON
- Mock 模式状态
Errors 需要 Badge：
- errorCount = 0 时普通按钮
- errorCount > 0 时 danger 按钮
### 4. 预览区改造
PreviewCanvas 需要具备：
- 空状态
- 生成中状态
- 成功状态
- 错误状态
- 渲染内容区域
- 组件 hover / selected 状态
预览区应有专业工作台质感，不要只是虚线空框。
### 5. Debug 能力改造
将 Store / Errors / A2UI JSON 从多个弹窗整合为 DebugDrawer。
DebugDrawer 内部使用 Tabs：
- 协议 JSON
- Store 状态树
- Errors
JSON 面板至少提供：
- 格式化展示
- 复制 JSON
- 搜索字段
### 6. 视觉规范
使用 Ant Design ConfigProvider 统一主题：
- 主色：#1677FF
- 页面背景：#F5F7FB
- 卡片背景：#FFFFFF
- 边框：#E5E7EB
- 主文字：#1F2937
- 次级文字：#6B7280
- 圆角：10 或 12
- 控件高度：32-36px
### 7. 交互状态
必须补齐：
- 发送中 loading
- SSE streaming 状态
- 渲染成功状态
- 渲染失败状态
- 错误数量 Badge
- 复制成功 message
- 空状态引导
- 重新生成按钮
## 验收标准
1. 页面视觉比当前更清爽、专业、统一。
2. 左侧信息不再拥挤。
3. 右侧预览区具有明确工作台质感。
4. JSON / Store / Errors 不再分散成多个孤立弹窗。
5. 所有原有功能仍然可用。
6. React + Ant Design 组件使用规范。
7. 没有破坏现有 A2UI 渲染和 SSE 流式逻辑。
8. 代码拆分清晰，便于继续维护。

⸻

7. 优先级建议

P0：第一轮必须改

1. 左侧 Agent Panel 分区
2. 顶部按钮中文化与状态化
3. PreviewCanvas 空状态 / 加载中 / 错误状态
4. Store / Errors / JSON 整合为 DebugDrawer
5. Ant Design ConfigProvider 统一主题

P1：第二轮增强

1. Prompt 示例标签
2. 生成历史记录
3. JSON 复制 / 搜索
4. Errors Badge
5. 组件选中态 Inspector

P2：产品化能力

1. 示例库
2. 导出 JSON
3. 导出截图
4. 保存 Mock 场景
5. 多主题：浅色 / 深色

⸻

8. 最终建议

这个项目不应该只做“美化”，而应该做一次 工作台化改造。

核心方向是：

左侧：从聊天输入区升级为 Agent 控制台
右侧：从预览空白区升级为 A2UI 工作台
顶部：从按钮集合升级为状态工具栏
弹窗：从分散弹窗升级为统一 Debug Drawer
交互：从被动展示升级为状态驱动

给 Codex 的要求可以强硬一点：

不要只改 CSS。
不要只调整间距。
不要只替换颜色。
必须结合 ui-ux-pro-max-skill，对布局、视觉层级、交互状态、调试面板、Ant Design 主题进行系统性改造。

这样 Codex 执行时才不会停留在表面样式，而是会围绕产品体验做完整升级。