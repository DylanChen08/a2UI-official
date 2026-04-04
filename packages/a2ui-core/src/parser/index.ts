import React from 'react';
import type { StoreApi as VanillaStoreApi } from 'zustand/vanilla';
import { resolveBoundText, walkImplicitBoundInits, getByPath } from '../dataModel';
import {
  Surface,
  HydrateNode,
  RenderMap,
  RenderFunction,
  ErrorType,
  type A2uiStoreState
} from '../store';

/** List `children.template` 每项运行时 id */
export function makeTemplateInstanceId(
  parentComponentId: string,
  templateComponentId: string,
  index: number
): string {
  return `${parentComponentId}__tpl__${templateComponentId}__${index}`;
}

function normalizeTemplateListData(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    return Object.values(raw as object);
  }
  return [];
}

export interface A2UIMessage {
  beginRendering?: BeginRendering;
  surfaceUpdate?: SurfaceUpdate;
  dataModelUpdate?: DataModelUpdate;
  deleteSurface?: DeleteSurface;
}

export interface BeginRendering {
  surfaceId: string;
  catalogId?: string;
  root: string;
  styles?: Record<string, any>;
}

export interface SurfaceUpdate {
  surfaceId: string;
  components: Component[];
}

export interface Component {
  id: string;
  weight?: number;
  component: Record<string, any>;
}

export interface DataModelUpdate {
  surfaceId: string;
  path?: string;
  contents: DataEntry[];
}

export interface DataEntry {
  key: string;
  valueString?: string;
  valueNumber?: number;
  valueBoolean?: boolean;
  valueMap?: MapEntry[];
}

export interface MapEntry {
  key: string;
  valueString?: string;
  valueNumber?: number;
  valueBoolean?: boolean;
  valueMap?: MapEntry[];
}

export interface DeleteSurface {
  surfaceId: string;
}

/** Parser 持有的 store，与 `createA2uiStore()` 返回值一致 */
export type A2uiParserStore = VanillaStoreApi<A2uiStoreState>;

export interface ComponentTree {
  root: HydrateNode;
  nodes: Record<string, HydrateNode>;
  rootVNode?: React.ReactElement;
}

// JSONL 缓冲区处理器 - 支持实时提取完整的 JSON 消息和组件
export class JSONLBuffer {
  private buffer: string = '';
  private messageCallback: (message: A2UIMessage) => void;
  private errorCallback: (error: Error) => void;

  constructor(
    messageCallback: (message: A2UIMessage) => void,
    errorCallback: (error: Error) => void = (error) => console.error('JSONL parsing error:', error)
  ) {
    this.messageCallback = messageCallback;
    this.errorCallback = errorCallback;
  }

  // 处理输入数据（可以是字符串或 Uint8Array）
  write(data: string | Uint8Array): void {
    const dataStr = data instanceof Uint8Array ? new TextDecoder().decode(data) : data;
    this.buffer += dataStr;
    this.processBuffer();
  }

  // 结束处理，处理剩余的缓冲区数据
  end(): void {
    if (this.buffer.trim()) {
      try {
        const message = JSON.parse(this.buffer);
        this.messageCallback(message);
      } catch (error) {
        this.errorCallback(new Error(`Invalid JSON at end of stream: ${this.buffer}`));
      }
    }
    this.buffer = '';
  }

  // 处理缓冲区中的数据 - 实时提取完整的 JSON 消息和组件
  private processBuffer(): void {
    let processed = true;
    
    // 循环处理，直到缓冲区中没有可处理的内容
    while (processed) {
      processed = this.extractAndProcessCompleteMessage();
    }
  }

  // 尝试提取并处理一个完整的 JSON 消息或组件
  private extractAndProcessCompleteMessage(): boolean {
    const trimmedBuffer = this.buffer.trim();
    if (!trimmedBuffer) {
      return false;
    }


    // 优先尝试按行分割
    const lines = trimmedBuffer.split('\n');
    
    // 处理所有完整的行
    if (lines.length > 1) {
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          this.processLine(line);
        }
      }
      
      // 保留最后一行（可能不完整）
      this.buffer = lines[lines.length - 1];
      return true;
    }

    // 只有一行，使用括号匹配检测是否是完整的 JSON 对象
    if (this.isCompleteJSON(trimmedBuffer)) {
      this.processLine(trimmedBuffer);
      this.buffer = '';
      return true;
    }

    // 检测是否是 surfaceUpdate 消息，尝试提取 surfaceId 和完整的组件
    // 在流式模式下，即使整个 JSON 对象不完整，也可以提取完整的组件
    if (trimmedBuffer.includes('"surfaceUpdate":')) {
      return this.extractSurfaceIdAndComponents(trimmedBuffer);
    }

    // 不是完整的 JSON，等待更多数据
    return false;
  }

  // 尝试从 surfaceUpdate 消息中提取 surfaceId 和完整的组件
  private extractSurfaceIdAndComponents(buffer: string): boolean {
    
    // 首先检查 components 数组是否开始存在
    const componentsStart = buffer.indexOf('"components":[');
    if (componentsStart === -1) {
      return false;
    }

    // 提取 surfaceId
    const surfaceIdMatch = buffer.match(/"surfaceId":\s*"([^"]+)"/);
    if (!surfaceIdMatch) {
      return false;
    }
    
    const surfaceId = surfaceIdMatch[1];

    const componentsContent = buffer.substring(componentsStart + '"components":['.length);

    // 尝试提取第一个完整的组件对象
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    let componentEnd = -1;
    let componentStart = -1;

    // 跳过前面的 },（如果有）
    let startIndex = 0;
    if (componentsContent.startsWith('},')) {
      startIndex = 2;
    }

    for (let i = startIndex; i < componentsContent.length; i++) {
      const char = componentsContent[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') {
          if (braceCount === 0) {
            componentStart = i;
          }
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            componentEnd = i + 1;
            break;
          }
        }
      }
    }

    if (componentEnd !== -1 && componentStart !== -1) {
      // 提取完整的组件
      const componentStr = componentsContent.substring(componentStart, componentEnd);
      
      try {
        const component = JSON.parse(componentStr);
        
        // 创建独立的 surfaceUpdate 消息
        const message: A2UIMessage = {
          surfaceUpdate: {
            surfaceId,
            components: [component]
          }
        };
        this.messageCallback(message);
        
        // 从缓冲区中移除已处理的组件
        const beforeComponents = buffer.substring(0, componentsStart + '"components":['.length);
        
        // 检查组件后面是否有逗号，如果有也一起移除
        let afterComponents = componentsContent.substring(componentEnd);
        
        // 移除组件后的逗号（如果有）
        if (afterComponents.startsWith(',')) {
          afterComponents = afterComponents.substring(1);
        }
        
        // 更新缓冲区
        this.buffer = beforeComponents + afterComponents;
        
        // 如果缓冲区中还有内容，继续处理
        if (this.buffer.trim()) {
          this.processBuffer();
        }
        
        return true;
      } catch (error) {
      }
    }

    return false;
  }

  // 检查字符串是否是完整的 JSON 对象
  // 使用括号匹配来检测完整的 JSON 对象
  private isCompleteJSON(str: string): boolean {
    try {
      const trimmed = str.trim();
      if (!trimmed) return false;
      
      // 检查是否以 { 开头
      if (!trimmed.startsWith('{')) {
        return false;
      }
      
      // 计算括号是否匹配
      let braceCount = 0;
      let inString = false;
      let escapeNext = false;
      
      for (let i = 0; i < trimmed.length; i++) {
        const char = trimmed[i];
        
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        
        if (char === '"') {
          inString = !inString;
          continue;
        }
        
        if (!inString) {
          if (char === '{') {
            braceCount++;
          } else if (char === '}') {
            braceCount--;
          }
        }
      }
      
      const isComplete = braceCount === 0;
      
      if (isComplete) {
        // 尝试解析验证
        const parsed = JSON.parse(trimmed);
        return true;
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  // 处理单行数据
  private processLine(line: string): void {
    try {
      const message = JSON.parse(line) as A2UIMessage;
      
      // 如果是 surfaceUpdate 消息，需要拆分为独立的 component 消息
      if (message.surfaceUpdate && message.surfaceUpdate.components) {
        const splitMessages = this.splitSurfaceUpdate(message);
        splitMessages.forEach((msg, index) => {
          this.messageCallback(msg);
        });
      } else {
        this.messageCallback(message);
      }
    } catch (error) {
      this.errorCallback(new Error(`Invalid JSON line: ${line}. Error: ${(error as Error).message}`));
    }
  }

  // 将 surfaceUpdate 消息拆分为多个独立的 component 消息
  private splitSurfaceUpdate(message: A2UIMessage): A2UIMessage[] {
    if (!message.surfaceUpdate || !message.surfaceUpdate.components) {
      return [message];
    }

    const { surfaceId, components } = message.surfaceUpdate;

    // 将每个 component 拆分为独立的 surfaceUpdate 消息
    const splitMessages = components.map((component, index) => {
      const splitMessage: A2UIMessage = {
        surfaceUpdate: {
          surfaceId,
          components: [component]
        }
      };
      return splitMessage;
    });

    return splitMessages;
  }
}

// 流式 JSONL 解析器
export class JSONLStreamParser {
  private parser: A2UIParser;
  private buffer: JSONLBuffer;
  private hydrateNodes: HydrateNode[] = [];
  private rootComponentId: string | undefined;
  private surfaceId: string | undefined;

  constructor(parser: A2UIParser) {
    this.parser = parser;
    this.buffer = new JSONLBuffer(
      (message) => this.handleMessage(message),
      (error) => console.error('JSONL stream error:', error)
    );
  }

  // 写入数据
  write(data: string | Uint8Array): void {
    this.buffer.write(data);
  }

  // 结束流
  end(): { rootVNode?: React.ReactElement; hydrateNodes: HydrateNode[] } {
    this.buffer.end();
    
    if (this.rootComponentId && this.hydrateNodes.length > 0) {
      const componentTree = this.parser.treeBuild(this.hydrateNodes, this.rootComponentId);
      return { rootVNode: componentTree.rootVNode, hydrateNodes: this.hydrateNodes };
    }
    
    return { hydrateNodes: this.hydrateNodes };
  }

  // 处理单个消息
  private handleMessage(message: A2UIMessage): void {
    const result = this.parser.parseMessage(message);
    
    if (result.surface) {
      this.surfaceId = result.surface.surfaceId;
      if (result.surface.beginrender) {
        this.rootComponentId = result.surface.rootNode.componentId;
      }
    }
    
    if (result.hydrateNodes) {
      this.hydrateNodes = [...this.hydrateNodes, ...result.hydrateNodes];
    }
  }
}

export class A2UIParser {
  private static instance: A2UIParser;
  private store: A2uiParserStore | null = null;
  private renderCallback: ((rootVNode: React.ReactElement) => void) | null = null;
  private hydrateNodes: HydrateNode[] = [];
  private rootComponentId: string | undefined;
  private jsonlBuffer: JSONLBuffer | null = null;
  private lastRenderTime: number = 0;
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingRender: boolean = false;
  /** 两次触发渲染之间的最小间隔（毫秒）。0 表示不节流。 */
  private renderThrottleMs: number = 400;

  static getInstance(): A2UIParser {
    if (!A2UIParser.instance) {
      A2UIParser.instance = new A2UIParser();
    }
    return A2UIParser.instance;
  }

  setStore(store: A2uiParserStore): void {
    this.store = store;
  }

  setRenderCallback(callback: (rootVNode: React.ReactElement) => void): void {
    this.renderCallback = callback;
  }

  /**
   * 设置渲染节流间隔（毫秒）。应在 init 时通过 InitOptions.renderThrottleMs 传入；
   * 直接操作 parser 时也可调用。0 表示每次触发都立即渲染。
   */
  setRenderThrottleMs(ms: number): void {
    this.renderThrottleMs = ms;
  }

  /**
   * 取消节流定时器并立即执行一次渲染。用于流式传输结束等场景，避免在待处理的 400ms 延迟后再显示最终树。
   */
  flushPendingRender(): void {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    this.pendingRender = false;
    this.lastRenderTime = Date.now();
    this.doRender();
  }

  /**
   * 清空 hydrate 缓冲、根组件 id、节流定时器与流式 buffer（单测或重新跑流前调用，避免单例状态串味）。
   */
  resetRuntimeState(): void {
    this.hydrateNodes = [];
    this.rootComponentId = undefined;
    this.lastRenderTime = 0;
    this.pendingRender = false;
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    this.jsonlBuffer = null;
  }

  private triggerRender(): void {
    
    if (this.hydrateNodes.length > 0) {
      const throttleMs = this.renderThrottleMs;
      const now = Date.now();
      const timeSinceLastRender = now - this.lastRenderTime;
      
      
      if (throttleMs <= 0) {
        if (this.renderTimer) {
          clearTimeout(this.renderTimer);
          this.renderTimer = null;
        }
        this.pendingRender = false;
        this.lastRenderTime = now;
        this.doRender();
        return;
      }

      if (timeSinceLastRender < throttleMs) {
        if (!this.pendingRender) {
          this.pendingRender = true;
          const delay = throttleMs - timeSinceLastRender;
          this.renderTimer = setTimeout(() => {
            this.pendingRender = false;
            this.lastRenderTime = Date.now();
            this.doRender();
          }, delay);
        }
      } else {
        if (this.renderTimer) {
          clearTimeout(this.renderTimer);
          this.renderTimer = null;
        }
        this.lastRenderTime = now;
        this.doRender();
      }
    }
  }

  private doRender(): void {
    
    // 确定根节点
    let rootComponentId = this.rootComponentId;
    if (!rootComponentId && this.hydrateNodes.length > 0) {
      rootComponentId = this.hydrateNodes[0].componentId;
    }
    
    // 构建组件树并渲染
    if (rootComponentId && this.hydrateNodes.length > 0) {
      const componentTree = this.treeBuild(this.hydrateNodes, rootComponentId);
      if (componentTree.rootVNode) {
        if (this.renderCallback) {
          this.renderCallback(componentTree.rootVNode);
        } else {
        }
      }
    }
  }

  private renderComponent(
    componentData: Record<string, any>,
    componentId?: string,
    ownerSurfaceId?: string,
    bindingScope?: unknown
  ): any {
    
    if (!this.store) {
      return componentData;
    }

    const state = this.store.getState();
    const renderMap = state.renderMap;
    
    if (!renderMap) {
      return componentData;
    }

    const componentName = Object.keys(componentData)[0];
    let componentProps = componentData[componentName];

    const getDm = state.getDataModel;
    const dataModel =
      ownerSurfaceId !== undefined && typeof getDm === 'function'
        ? getDm(ownerSurfaceId)
        : undefined;

    const textScope = bindingScope !== undefined ? bindingScope : dataModel;

    if (componentName === 'Text' && componentProps && typeof componentProps.text === 'object') {
      componentProps = {
        ...componentProps,
        text: {
          literalString: resolveBoundText(componentProps.text, textScope)
        }
      };
    }

    if (
      componentName === 'Image' &&
      componentProps &&
      componentProps.url !== undefined &&
      componentProps.url !== null &&
      typeof componentProps.url === 'object' &&
      !Array.isArray(componentProps.url)
    ) {
      componentProps = {
        ...componentProps,
        url: resolveBoundText(componentProps.url, textScope)
      };
    }

    if (
      componentName === 'Icon' &&
      componentProps &&
      componentProps.name !== undefined &&
      componentProps.name !== null &&
      typeof componentProps.name === 'object' &&
      !Array.isArray(componentProps.name)
    ) {
      componentProps = {
        ...componentProps,
        name: resolveBoundText(componentProps.name, textScope)
      };
    }

    if (componentName === 'Card' && componentProps) {
      let next = { ...componentProps };
      if (next.title && typeof next.title === 'object' && !Array.isArray(next.title)) {
        next = {
          ...next,
          title: { literalString: resolveBoundText(next.title, textScope) }
        };
      }
      if (next.subtitle && typeof next.subtitle === 'object' && !Array.isArray(next.subtitle)) {
        next = {
          ...next,
          subtitle: { literalString: resolveBoundText(next.subtitle, textScope) }
        };
      }
      componentProps = next;
    }

    if (renderMap[componentName]) {
      const propsWithId = componentId ? { ...componentProps, id: componentId } : componentProps;
      const result = renderMap[componentName](propsWithId);
      return result;
    } else {
      // 组件未注册，添加错误信息
      state.addError({
        type: ErrorType.PARE_ERROR,
        content: `Component "${componentName}" is not registered in renderMap`
      });
      return componentData;
    }
  }

  /**
   * 解析单个 A2UI 消息
   */
  parseMessage(message: A2UIMessage): {
    surface?: Surface;
    hydrateNodes?: HydrateNode[];
    dataModelUpdate?: DataModelUpdate;
    deleteSurface?: DeleteSurface;
  } {
    
    // 检查是否为有效的消息
    if (!message.beginRendering && !message.surfaceUpdate && !message.dataModelUpdate && !message.deleteSurface) {
      throw new Error('Invalid A2UI message: no action specified');
    }
    
    let result: {
      surface?: Surface;
      hydrateNodes?: HydrateNode[];
      dataModelUpdate?: DataModelUpdate;
      deleteSurface?: DeleteSurface;
    } = {};

    if (message.beginRendering) {
      result = this.parseBeginRendering(message.beginRendering);
      if (result.surface?.beginrender) {
        this.rootComponentId = result.surface.rootNode.componentId;
        this.hydrateNodes = [];
        
        // 将 surface 添加到 store 中
        if (this.store && result.surface) {
          this.store.getState().addSurface(result.surface);
        }
      }
    }
    if (message.surfaceUpdate) {
      const surfaceUpdateResult = this.parseSurfaceUpdate(message.surfaceUpdate);
      if (surfaceUpdateResult.hydrateNodes) {
        this.hydrateNodes = [...this.hydrateNodes, ...surfaceUpdateResult.hydrateNodes];
        
        // 将 hydrateNodes 添加到 store 中
        if (this.store) {
          surfaceUpdateResult.hydrateNodes.forEach(node => {
            this.store!.getState().addHydrateNode(node);
          });
        }
      }
      // 将 surface 添加到 store 中
      if (this.store && surfaceUpdateResult.surface) {
        this.store.getState().addSurface(surfaceUpdateResult.surface);
      }
      // 合并结果，不覆盖 surface
      result.hydrateNodes = surfaceUpdateResult.hydrateNodes;
      // 如果 result.surface 不存在，则创建一个新的 Surface
      if (!result.surface && surfaceUpdateResult.surface) {
        result.surface = surfaceUpdateResult.surface;
      }
    }
    if (message.dataModelUpdate) {
      const dmResult = this.parseDataModelUpdate(message.dataModelUpdate);
      result = { ...result, ...dmResult };
    }
    if (message.deleteSurface) {
      const delResult = this.parseDeleteSurface(message.deleteSurface);
      result = { ...result, ...delResult };
    }

    // 触发渲染
    this.triggerRender();

    return result;
  }

  /**
   * 初始化流式解析模式
   * 在流式模式下，parseMessage 会自动处理缓冲区
   */
  initStreamMode(): void {
    this.jsonlBuffer = new JSONLBuffer(
      (message) => {
        this.parseMessage(message);
      },
      (error) => {
        console.error('[A2UIParser] Stream parsing error:', error);
        if (this.store) {
          this.store.getState().addError({
            type: ErrorType.PARE_ERROR,
            content: error.message
          });
        }
      }
    );
  }

  /**
   * 向流式解析器写入数据
   * 需要先调用 initStreamMode() 初始化
   */
  write(data: string | Uint8Array): void {
    if (!this.jsonlBuffer) {
      throw new Error('Stream mode not initialized. Call initStreamMode() first.');
    }
    this.jsonlBuffer.write(data);
  }

  /**
   * 结束流式解析，处理剩余数据
   */
  endStream(): void {
    if (this.jsonlBuffer) {
      this.jsonlBuffer.end();
      this.jsonlBuffer = null;
    }
  }

  parseBeginRendering(beginRendering: BeginRendering): {
    surface: Surface;
  } {
    const tempRootNode: HydrateNode = {
      componentId: beginRendering.root,
      _vnode: React.createElement('div', { 'data-testid': 'root-placeholder', id: beginRendering.root }),
      ownerSurfaceId: beginRendering.surfaceId,
      protocal: JSON.stringify({ id: beginRendering.root, component: {} })
    };

    const surface: Surface = {
      surfaceId: beginRendering.surfaceId,
      beginrender: true,
      rootNode: tempRootNode
    };
    return { surface };
  }

  parseSurfaceUpdate(surfaceUpdate: SurfaceUpdate): {
    surface: Surface;
    hydrateNodes: HydrateNode[];
  } {

    if (this.store) {
      const st = this.store.getState();
      if (typeof st.setDataModelValueAtPath === 'function') {
        for (const component of surfaceUpdate.components) {
          walkImplicitBoundInits(surfaceUpdate.surfaceId, component.component, (sid, path, val) => {
            st.setDataModelValueAtPath(sid, path, val);
          });
        }
      }
    }

    const hydrateNodes: HydrateNode[] = surfaceUpdate.components.map(component => {
      const componentData = component.component;
      const componentName = Object.keys(componentData)[0];
      const componentProps = componentData[componentName];
      
      
      // 提取children信息（explicitList 与 template 互斥，优先 explicitList）
      const children = this.extractChildren(componentProps);
      const childrenTemplate =
        !children || children.length === 0
          ? this.extractChildrenTemplate(componentProps)
          : undefined;
      
      return {
        componentId: component.id,
        _vnode: this.renderComponent(
          component.component,
          component.id,
          surfaceUpdate.surfaceId
        ),
        ownerSurfaceId: surfaceUpdate.surfaceId,
        protocal: JSON.stringify(component),
        children,
        childrenTemplate,
        hasMounted: false
      };
    });

    // 根节点必须以 beginRendering.root 为准；不能仅用 components[0]（顺序可能与 root 不一致，或增量更新仅含子节点）
    const rootId =
      this.rootComponentId !== undefined
        ? this.rootComponentId
        : surfaceUpdate.components[0]?.id;
    let rootHydrateNode = rootId
      ? hydrateNodes.find((node) => node.componentId === rootId)
      : undefined;
    if (!rootHydrateNode && this.store && rootId) {
      const existing = this.store.getState().getSurface(surfaceUpdate.surfaceId);
      if (existing && existing.rootNode.componentId === rootId) {
        rootHydrateNode = existing.rootNode;
      }
    }
    if (!rootHydrateNode) {
      rootHydrateNode = surfaceUpdate.components[0]?.id
        ? hydrateNodes.find((node) => node.componentId === surfaceUpdate.components[0].id)
        : undefined;
    }

    if (!rootHydrateNode) {
      throw new Error('Root component not found in surfaceUpdate');
    }

    const surface: Surface = {
      surfaceId: surfaceUpdate.surfaceId,
      beginrender: false,
      rootNode: rootHydrateNode
    };

    return { surface, hydrateNodes };
  }

  private extractChildren(componentProps: any): string[] | undefined {
    // 检查组件是否有children属性
    if (componentProps.children && componentProps.children.explicitList) {
      return componentProps.children.explicitList;
    }
    // Button：协议用 child 指向单个子组件 id（多为 Text），供 treeBuild 挂载
    if (typeof componentProps.child === 'string' && componentProps.child.trim()) {
      return [componentProps.child.trim()];
    }
    return undefined;
  }

  private extractChildrenTemplate(
    componentProps: any
  ): import('../store').ChildrenTemplateMeta | undefined {
    const t = componentProps?.children?.template;
    if (
      t &&
      typeof t.componentId === 'string' &&
      typeof t.dataBinding === 'string'
    ) {
      return { dataBinding: t.dataBinding, templateComponentId: t.componentId };
    }
    return undefined;
  }

  parseDataModelUpdate(dataModelUpdate: DataModelUpdate): {
    dataModelUpdate: DataModelUpdate;
  } {
    if (this.store) {
      const apply = this.store.getState().applyDataModelUpdate;
      if (typeof apply === 'function') {
        apply(dataModelUpdate);
      }
    }
    return { dataModelUpdate };
  }

  parseDeleteSurface(deleteSurface: DeleteSurface): {
    deleteSurface: DeleteSurface;
  } {
    if (this.store) {
      const rm = this.store.getState().removeSurface;
      if (typeof rm === 'function') {
        rm(deleteSurface.surfaceId);
      }
    }
    return { deleteSurface };
  }

  parseJSONL(jsonl: string): A2UIMessage[] {
    return jsonl.split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  }

  stringifyJSONL(messages: A2UIMessage[]): string {
    return messages.map(message => JSON.stringify(message)).join('\n');
  }

  // 创建流式解析器
  createStreamParser(): JSONLStreamParser {
    return new JSONLStreamParser(this);
  }

  treeBuild(hydrateNodes: HydrateNode[], rootComponentId?: string): ComponentTree {
    
    if (hydrateNodes.length === 0) {
      throw new Error('No hydrate nodes provided for tree building');
    }

    // 构建组件映射
    const nodes: Record<string, HydrateNode> = {};
    hydrateNodes.forEach(node => {
      nodes[node.componentId] = node;
    });

    // 递归构建组件树，替换children为实际的子组件
    const buildTree = (node: HydrateNode, depth: number = 0): React.ReactElement => {

      // 重新渲染组件，确保动画逻辑被执行
      const protocal = JSON.parse(node.protocal);
      const componentData = protocal.component;
      let currentVNode = this.renderComponent(
        componentData,
        node.componentId,
        node.ownerSurfaceId
      );

      // 未注册 renderMap 或返回非 React 元素时，用占位元素参与树组装，避免 treeBuild 中断
      if (!React.isValidElement(currentVNode)) {
        currentVNode = React.createElement('div', {
          id: node.componentId,
          'data-a2ui-unrendered': true
        });
      }
      const currentProps = currentVNode.props as any;
      if (!currentProps.id) {
        currentVNode = React.cloneElement(currentVNode as React.ReactElement<any>, {
          id: node.componentId
        });
      }
      
      const stripDeclarativeChildProps = (baseProps: any): any => {
        const newProps: any = { ...baseProps };
        if (newProps.children && typeof newProps.children === 'object') {
          newProps.children = { ...newProps.children };
        }
        if (newProps.children && typeof newProps.children === 'object' && newProps.children.explicitList) {
          delete newProps.children.explicitList;
          if (Object.keys(newProps.children).length === 0) {
            delete newProps.children;
          }
        }
        if (newProps.children && typeof newProps.children === 'object' && newProps.children.template) {
          delete newProps.children.template;
          if (Object.keys(newProps.children).length === 0) {
            delete newProps.children;
          }
        }
        if (newProps.children && typeof newProps.children === 'object' && !Array.isArray(newProps.children)) {
          delete newProps.children;
        }
        if (newProps.child !== undefined) {
          delete newProps.child;
        }
        return newProps;
      };

      if (node.childrenTemplate) {
        const tmpl = node.childrenTemplate;
        const getDm = this.store?.getState().getDataModel;
        const dataModel =
          node.ownerSurfaceId !== undefined && typeof getDm === 'function'
            ? getDm(node.ownerSurfaceId)
            : undefined;
        const raw =
          dataModel !== undefined ? getByPath(dataModel, tmpl.dataBinding) : undefined;
        const items = normalizeTemplateListData(raw);
        const templateNode = nodes[tmpl.templateComponentId];
        const tplChildElements: React.ReactElement[] = [];
        if (templateNode) {
          const tplProtocal = JSON.parse(templateNode.protocal);
          const tplComponentData = tplProtocal.component;
          items.forEach((item, index) => {
            const syntheticId = makeTemplateInstanceId(
              node.componentId,
              tmpl.templateComponentId,
              index
            );
            let el = this.renderComponent(
              tplComponentData,
              syntheticId,
              node.ownerSurfaceId,
              item
            );
            if (!React.isValidElement(el)) {
              el = React.createElement('div', {
                id: syntheticId,
                'data-a2ui-unrendered': true
              });
            }
            const ep = (el as React.ReactElement).props as any;
            if (!ep.id) {
              el = React.cloneElement(el as React.ReactElement<any>, { id: syntheticId });
            }
            tplChildElements.push(
              React.cloneElement(el as React.ReactElement<any>, {
                key: syntheticId,
                id: syntheticId
              })
            );
          });
        }
        const newProps = stripDeclarativeChildProps(currentVNode.props as any);
        if (tplChildElements.length === 0) {
          newProps.children = undefined;
        }
        const clonedTpl = React.cloneElement(currentVNode, newProps, ...tplChildElements);
        return clonedTpl;
      }

      if (!node.children || node.children.length === 0) {
        
        const leafProps = currentVNode.props as any;
        if (leafProps.children && typeof leafProps.children === 'object' && !Array.isArray(leafProps.children)) {
          return React.cloneElement(currentVNode, stripDeclarativeChildProps(leafProps));
        }
        
        return currentVNode;
      }

      // 递归构建所有子组件
      const childElements = node.children.map(childId => {
        const childNode = nodes[childId];
        if (childNode) {
          return buildTree(childNode, depth + 1);
        }
        return null;
      }).filter(Boolean) as React.ReactElement[];
      

      // 使用 React.cloneElement 来正确组装 children
      
      const newProps = stripDeclarativeChildProps(currentProps);
      
      
      // 如果没有有效的子组件，明确设置 children 为 undefined
      if (childElements.length === 0) {
        newProps.children = undefined;
      }
      
      
      const clonedVNode = React.cloneElement(currentVNode, newProps, ...childElements);
      
      return clonedVNode;
    };

    // 确定根节点
    let root: HydrateNode;
    if (rootComponentId) {
      root = nodes[rootComponentId];
    } else {
      root = hydrateNodes[0];
    }
    

    // 从根节点开始构建树
    const rootVNode = buildTree(root, 0);
    

    return {
      root: root,
      nodes,
      rootVNode
    };
  }
}

export const a2uiParser = A2UIParser.getInstance();
