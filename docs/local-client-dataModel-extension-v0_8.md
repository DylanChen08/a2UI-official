# 本地 action 触发 dataModel 更新（实现层扩展 v0_8）

A2UI 0.8 标准 [client_to_server](../specification/v0_8/json/client_to_server.json) 只描述客户端发往服务端的 **`userAction`** / **`error`**，未规定「不经过服务端、仅在客户端写入数据模型」的流程。本仓库约定如下扩展，供 **a2ui-react** 等宿主实现 **本地 `dataModelUpdate`** 等价行为。

## 1. Surface 中 `Button.action.localDataModelUpdate`

在 **`surfaceUpdate.components[].component.Button.action`** 上可增加可选字段 **`localDataModelUpdate`**：

- 类型与 **`dataModelUpdate`** 消息相同：`{ surfaceId, path?, contents }`（邻接表 `contents` 与 [mergeDataModelUpdate](../packages/a2ui-core/src/dataModel.ts) 一致）。
- 语义：用户点击该按钮时，宿主在客户端调用 **`applyDataModelUpdate(localDataModelUpdate)`**，等价于收到一条服务端下发的 **`dataModelUpdate`**，然后 **`flushPendingRender` / `triggerRender`** 刷新由 `treeBuild` 生成的 UI。

仍应保留 **`action.name`**（及可选 **`context`**），以便需要时组装标准 **`userAction`** 上报。

## 2. 发往服务端时的可选字段（`userAction`）

在实现层可向 **`userAction`** 增加可选字段（见 [client_to_server.json](../specification/v0_8/json/client_to_server.json) 中的扩展说明）：

- **`deliveryMode`**：`"server"`（默认，仅转发事件）| `"local"`（表示已或拟在本地应用 `localDataModelUpdate`；是否仍发送 `userAction` 由宿主策略决定）。
- **`localDataModelUpdate`**：可选，与上节同形；用于日志或与 surface 定义对齐。

**最小实现**可只实现第 1 节，不强制上报 `userAction`。

## 3. `Button.action.openLink`（打开外部网页）

在 **`Button.action`** 上可增加可选字段 **`openLink`**：`{ url: string; target?: "_blank" | "_self" | "_parent" | "_top" }`（默认按 **`_blank`** 新标签打开）。

- 语义：用户点击时，宿主在客户端执行导航（如 **`window.open`** / **`location.assign`**），**不**依赖服务端回包。
- 可与 **`localDataModelUpdate`** 同时存在；实现上先执行 **`openLink`**，再应用本地数据更新（可按产品调整顺序）。

发往服务端时可在 **`userAction`** 上增加可选 **`openLink`**（同形），便于日志或与 surface 对齐。

## 4. 参考实现位置

- 宿主接线：[createRenderMap](../packages/a2ui-react/src/components/index.ts) 的 `CreateRenderMapLocalOptions`（`applyLocalDataModelUpdate`、`requestTreeRefresh`、`openExternalLink`）。
- 示例 mock：[local-action-text-demo.json](../packages/a2ui-core/mock/local-action-text-demo.json)。
