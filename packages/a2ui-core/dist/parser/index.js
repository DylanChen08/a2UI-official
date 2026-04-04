"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.a2uiParser = exports.A2UIParser = exports.JSONLStreamParser = exports.JSONLBuffer = void 0;
exports.makeTemplateInstanceId = makeTemplateInstanceId;
const react_1 = __importDefault(require("react"));
const dataModel_1 = require("../dataModel");
const store_1 = require("../store");
/** List `children.template` 每项运行时 id */
function makeTemplateInstanceId(parentComponentId, templateComponentId, index) {
    return `${parentComponentId}__tpl__${templateComponentId}__${index}`;
}
function normalizeTemplateListData(raw) {
    if (Array.isArray(raw))
        return raw;
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
        return Object.values(raw);
    }
    return [];
}
// JSONL 缓冲区处理器 - 支持实时提取完整的 JSON 消息和组件
class JSONLBuffer {
    constructor(messageCallback, errorCallback = (error) => console.error('JSONL parsing error:', error)) {
        this.buffer = '';
        this.messageCallback = messageCallback;
        this.errorCallback = errorCallback;
    }
    // 处理输入数据（可以是字符串或 Uint8Array）
    write(data) {
        const dataStr = data instanceof Uint8Array ? new TextDecoder().decode(data) : data;
        this.buffer += dataStr;
        this.processBuffer();
    }
    // 结束处理，处理剩余的缓冲区数据
    end() {
        if (this.buffer.trim()) {
            try {
                const message = JSON.parse(this.buffer);
                this.messageCallback(message);
            }
            catch (error) {
                this.errorCallback(new Error(`Invalid JSON at end of stream: ${this.buffer}`));
            }
        }
        this.buffer = '';
    }
    // 处理缓冲区中的数据 - 实时提取完整的 JSON 消息和组件
    processBuffer() {
        let processed = true;
        // 循环处理，直到缓冲区中没有可处理的内容
        while (processed) {
            processed = this.extractAndProcessCompleteMessage();
        }
    }
    // 尝试提取并处理一个完整的 JSON 消息或组件
    extractAndProcessCompleteMessage() {
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
    extractSurfaceIdAndComponents(buffer) {
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
                }
                else if (char === '}') {
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
                const message = {
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
            }
            catch (error) {
            }
        }
        return false;
    }
    // 检查字符串是否是完整的 JSON 对象
    // 使用括号匹配来检测完整的 JSON 对象
    isCompleteJSON(str) {
        try {
            const trimmed = str.trim();
            if (!trimmed)
                return false;
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
                    }
                    else if (char === '}') {
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
        }
        catch (error) {
            return false;
        }
    }
    // 处理单行数据
    processLine(line) {
        try {
            const message = JSON.parse(line);
            // 如果是 surfaceUpdate 消息，需要拆分为独立的 component 消息
            if (message.surfaceUpdate && message.surfaceUpdate.components) {
                const splitMessages = this.splitSurfaceUpdate(message);
                splitMessages.forEach((msg, index) => {
                    this.messageCallback(msg);
                });
            }
            else {
                this.messageCallback(message);
            }
        }
        catch (error) {
            this.errorCallback(new Error(`Invalid JSON line: ${line}. Error: ${error.message}`));
        }
    }
    // 将 surfaceUpdate 消息拆分为多个独立的 component 消息
    splitSurfaceUpdate(message) {
        if (!message.surfaceUpdate || !message.surfaceUpdate.components) {
            return [message];
        }
        const { surfaceId, components } = message.surfaceUpdate;
        // 将每个 component 拆分为独立的 surfaceUpdate 消息
        const splitMessages = components.map((component, index) => {
            const splitMessage = {
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
exports.JSONLBuffer = JSONLBuffer;
// 流式 JSONL 解析器
class JSONLStreamParser {
    constructor(parser) {
        this.hydrateNodes = [];
        this.parser = parser;
        this.buffer = new JSONLBuffer((message) => this.handleMessage(message), (error) => console.error('JSONL stream error:', error));
    }
    // 写入数据
    write(data) {
        this.buffer.write(data);
    }
    // 结束流
    end() {
        this.buffer.end();
        if (this.rootComponentId && this.hydrateNodes.length > 0) {
            const componentTree = this.parser.treeBuild(this.hydrateNodes, this.rootComponentId);
            return { rootVNode: componentTree.rootVNode, hydrateNodes: this.hydrateNodes };
        }
        return { hydrateNodes: this.hydrateNodes };
    }
    // 处理单个消息
    handleMessage(message) {
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
exports.JSONLStreamParser = JSONLStreamParser;
class A2UIParser {
    constructor() {
        this.store = null;
        this.renderCallback = null;
        this.hydrateNodes = [];
        this.jsonlBuffer = null;
        this.lastRenderTime = 0;
        this.renderTimer = null;
        this.pendingRender = false;
        /** 两次触发渲染之间的最小间隔（毫秒）。0 表示不节流。 */
        this.renderThrottleMs = 400;
    }
    static getInstance() {
        if (!A2UIParser.instance) {
            A2UIParser.instance = new A2UIParser();
        }
        return A2UIParser.instance;
    }
    setStore(store) {
        this.store = store;
    }
    setRenderCallback(callback) {
        this.renderCallback = callback;
    }
    /**
     * 设置渲染节流间隔（毫秒）。应在 init 时通过 InitOptions.renderThrottleMs 传入；
     * 直接操作 parser 时也可调用。0 表示每次触发都立即渲染。
     */
    setRenderThrottleMs(ms) {
        this.renderThrottleMs = ms;
    }
    /**
     * 取消节流定时器并立即执行一次渲染。用于流式传输结束等场景，避免在待处理的 400ms 延迟后再显示最终树。
     */
    flushPendingRender() {
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
    resetRuntimeState() {
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
    triggerRender() {
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
            }
            else {
                if (this.renderTimer) {
                    clearTimeout(this.renderTimer);
                    this.renderTimer = null;
                }
                this.lastRenderTime = now;
                this.doRender();
            }
        }
    }
    doRender() {
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
                }
                else {
                }
            }
        }
    }
    renderComponent(componentData, componentId, ownerSurfaceId, bindingScope) {
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
        const dataModel = ownerSurfaceId !== undefined && typeof getDm === 'function'
            ? getDm(ownerSurfaceId)
            : undefined;
        const textScope = bindingScope !== undefined ? bindingScope : dataModel;
        if (componentName === 'Text' && componentProps && typeof componentProps.text === 'object') {
            componentProps = {
                ...componentProps,
                text: {
                    literalString: (0, dataModel_1.resolveBoundText)(componentProps.text, textScope)
                }
            };
        }
        if (renderMap[componentName]) {
            const propsWithId = componentId ? { ...componentProps, id: componentId } : componentProps;
            const result = renderMap[componentName](propsWithId);
            return result;
        }
        else {
            // 组件未注册，添加错误信息
            state.addError({
                type: store_1.ErrorType.PARE_ERROR,
                content: `Component "${componentName}" is not registered in renderMap`
            });
            return componentData;
        }
    }
    /**
     * 解析单个 A2UI 消息
     */
    parseMessage(message) {
        // 检查是否为有效的消息
        if (!message.beginRendering && !message.surfaceUpdate && !message.dataModelUpdate && !message.deleteSurface) {
            throw new Error('Invalid A2UI message: no action specified');
        }
        let result = {};
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
                        this.store.getState().addHydrateNode(node);
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
    initStreamMode() {
        this.jsonlBuffer = new JSONLBuffer((message) => {
            this.parseMessage(message);
        }, (error) => {
            console.error('[A2UIParser] Stream parsing error:', error);
            if (this.store) {
                this.store.getState().addError({
                    type: store_1.ErrorType.PARE_ERROR,
                    content: error.message
                });
            }
        });
    }
    /**
     * 向流式解析器写入数据
     * 需要先调用 initStreamMode() 初始化
     */
    write(data) {
        if (!this.jsonlBuffer) {
            throw new Error('Stream mode not initialized. Call initStreamMode() first.');
        }
        this.jsonlBuffer.write(data);
    }
    /**
     * 结束流式解析，处理剩余数据
     */
    endStream() {
        if (this.jsonlBuffer) {
            this.jsonlBuffer.end();
            this.jsonlBuffer = null;
        }
    }
    parseBeginRendering(beginRendering) {
        const tempRootNode = {
            componentId: beginRendering.root,
            _vnode: react_1.default.createElement('div', { 'data-testid': 'root-placeholder', id: beginRendering.root }),
            ownerSurfaceId: beginRendering.surfaceId,
            protocal: JSON.stringify({ id: beginRendering.root, component: {} })
        };
        const surface = {
            surfaceId: beginRendering.surfaceId,
            beginrender: true,
            rootNode: tempRootNode
        };
        return { surface };
    }
    parseSurfaceUpdate(surfaceUpdate) {
        if (this.store) {
            const st = this.store.getState();
            if (typeof st.setDataModelValueAtPath === 'function') {
                for (const component of surfaceUpdate.components) {
                    (0, dataModel_1.walkImplicitBoundInits)(surfaceUpdate.surfaceId, component.component, (sid, path, val) => {
                        st.setDataModelValueAtPath(sid, path, val);
                    });
                }
            }
        }
        const hydrateNodes = surfaceUpdate.components.map(component => {
            const componentData = component.component;
            const componentName = Object.keys(componentData)[0];
            const componentProps = componentData[componentName];
            // 提取children信息（explicitList 与 template 互斥，优先 explicitList）
            const children = this.extractChildren(componentProps);
            const childrenTemplate = !children || children.length === 0
                ? this.extractChildrenTemplate(componentProps)
                : undefined;
            return {
                componentId: component.id,
                _vnode: this.renderComponent(component.component, component.id, surfaceUpdate.surfaceId),
                ownerSurfaceId: surfaceUpdate.surfaceId,
                protocal: JSON.stringify(component),
                children,
                childrenTemplate,
                hasMounted: false
            };
        });
        const rootHydrateNode = hydrateNodes.find(node => node.componentId === surfaceUpdate.components[0].id);
        if (!rootHydrateNode) {
            throw new Error('Root component not found in surfaceUpdate');
        }
        const surface = {
            surfaceId: surfaceUpdate.surfaceId,
            beginrender: false,
            rootNode: rootHydrateNode
        };
        return { surface, hydrateNodes };
    }
    extractChildren(componentProps) {
        // 检查组件是否有children属性
        if (componentProps.children && componentProps.children.explicitList) {
            return componentProps.children.explicitList;
        }
        return undefined;
    }
    extractChildrenTemplate(componentProps) {
        const t = componentProps?.children?.template;
        if (t &&
            typeof t.componentId === 'string' &&
            typeof t.dataBinding === 'string') {
            return { dataBinding: t.dataBinding, templateComponentId: t.componentId };
        }
        return undefined;
    }
    parseDataModelUpdate(dataModelUpdate) {
        if (this.store) {
            const apply = this.store.getState().applyDataModelUpdate;
            if (typeof apply === 'function') {
                apply(dataModelUpdate);
            }
        }
        return { dataModelUpdate };
    }
    parseDeleteSurface(deleteSurface) {
        if (this.store) {
            const rm = this.store.getState().removeSurface;
            if (typeof rm === 'function') {
                rm(deleteSurface.surfaceId);
            }
        }
        return { deleteSurface };
    }
    parseJSONL(jsonl) {
        return jsonl.split('\n')
            .filter(line => line.trim())
            .map(line => JSON.parse(line));
    }
    stringifyJSONL(messages) {
        return messages.map(message => JSON.stringify(message)).join('\n');
    }
    // 创建流式解析器
    createStreamParser() {
        return new JSONLStreamParser(this);
    }
    treeBuild(hydrateNodes, rootComponentId) {
        if (hydrateNodes.length === 0) {
            throw new Error('No hydrate nodes provided for tree building');
        }
        // 构建组件映射
        const nodes = {};
        hydrateNodes.forEach(node => {
            nodes[node.componentId] = node;
        });
        // 递归构建组件树，替换children为实际的子组件
        const buildTree = (node, depth = 0) => {
            // 重新渲染组件，确保动画逻辑被执行
            const protocal = JSON.parse(node.protocal);
            const componentData = protocal.component;
            let currentVNode = this.renderComponent(componentData, node.componentId, node.ownerSurfaceId);
            // 未注册 renderMap 或返回非 React 元素时，用占位元素参与树组装，避免 treeBuild 中断
            if (!react_1.default.isValidElement(currentVNode)) {
                currentVNode = react_1.default.createElement('div', {
                    id: node.componentId,
                    'data-a2ui-unrendered': true
                });
            }
            const currentProps = currentVNode.props;
            if (!currentProps.id) {
                currentVNode = react_1.default.cloneElement(currentVNode, {
                    id: node.componentId
                });
            }
            const stripDeclarativeChildProps = (baseProps) => {
                const newProps = { ...baseProps };
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
                return newProps;
            };
            if (node.childrenTemplate) {
                const tmpl = node.childrenTemplate;
                const getDm = this.store?.getState().getDataModel;
                const dataModel = node.ownerSurfaceId !== undefined && typeof getDm === 'function'
                    ? getDm(node.ownerSurfaceId)
                    : undefined;
                const raw = dataModel !== undefined ? (0, dataModel_1.getByPath)(dataModel, tmpl.dataBinding) : undefined;
                const items = normalizeTemplateListData(raw);
                const templateNode = nodes[tmpl.templateComponentId];
                const tplChildElements = [];
                if (templateNode) {
                    const tplProtocal = JSON.parse(templateNode.protocal);
                    const tplComponentData = tplProtocal.component;
                    items.forEach((item, index) => {
                        const syntheticId = makeTemplateInstanceId(node.componentId, tmpl.templateComponentId, index);
                        let el = this.renderComponent(tplComponentData, syntheticId, node.ownerSurfaceId, item);
                        if (!react_1.default.isValidElement(el)) {
                            el = react_1.default.createElement('div', {
                                id: syntheticId,
                                'data-a2ui-unrendered': true
                            });
                        }
                        const ep = el.props;
                        if (!ep.id) {
                            el = react_1.default.cloneElement(el, { id: syntheticId });
                        }
                        tplChildElements.push(react_1.default.cloneElement(el, {
                            key: syntheticId,
                            id: syntheticId
                        }));
                    });
                }
                const newProps = stripDeclarativeChildProps(currentVNode.props);
                if (tplChildElements.length === 0) {
                    newProps.children = undefined;
                }
                const clonedTpl = react_1.default.cloneElement(currentVNode, newProps, ...tplChildElements);
                return clonedTpl;
            }
            if (!node.children || node.children.length === 0) {
                const leafProps = currentVNode.props;
                if (leafProps.children && typeof leafProps.children === 'object' && !Array.isArray(leafProps.children)) {
                    return react_1.default.cloneElement(currentVNode, stripDeclarativeChildProps(leafProps));
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
            }).filter(Boolean);
            // 使用 React.cloneElement 来正确组装 children
            const newProps = stripDeclarativeChildProps(currentProps);
            // 如果没有有效的子组件，明确设置 children 为 undefined
            if (childElements.length === 0) {
                newProps.children = undefined;
            }
            const clonedVNode = react_1.default.cloneElement(currentVNode, newProps, ...childElements);
            return clonedVNode;
        };
        // 确定根节点
        let root;
        if (rootComponentId) {
            root = nodes[rootComponentId];
        }
        else {
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
exports.A2UIParser = A2UIParser;
exports.a2uiParser = A2UIParser.getInstance();
//# sourceMappingURL=index.js.map