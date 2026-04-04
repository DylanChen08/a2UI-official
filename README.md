## 项目介绍
实现一个A2UI-playground, 用户通过web应用生成对应的UI界面

## 项目架构
项目使用monorepo组织代码
包含以下几个核心模块

packages
- a2ui-core: 包含UI组件库和渲染引擎,包含以下模块：
    - parser用来解析a2ui协议
    - vnode，用来映射管理a2ui协议生成的组件
    - treebuilder，用来根据a2ui协议生成调用a2ui渲染器，并生成最终的渲染树

- a2ui-react: 基于react的a2ui协议渲染引擎

package主要职责： 维护a2ui 相关的sdk, 并支持支持生产对应的npm包


web
- a2ui-playground: 包含A2UI-playground的web应用

主要职责及详细功能
1. 可以通过对话的方式，让AI Agent生成对应的UI界面
2. 可以预览对应的AI界面
3. 可以支持多轮对话对生成的UI进行调整
4. 可以预览a2ui-react 定义的基础a2ui组件
5. 可以支持协议调试


server
- a2ui-playground-server: 包含A2UI-playground的server端应用

1. 基于openAI, 实现a2ui agent
2. 实现a2ui-server，支持a2ui协议的生成及缓存


### 基础依赖
所有的项目需要支持typescript

web: 使用vite构建playground
server: 
- 使用koa实现服务接口
- agent基于openAI建链
- 使用ts-node运行


