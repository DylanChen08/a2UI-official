import { createA2uiStore, a2uiStore, RenderMap } from './store';
import { A2UIParser, a2uiParser, A2UIMessage, BeginRendering, SurfaceUpdate, DataModelUpdate, DeleteSurface } from './parser';

export * from './store';
export * from './parser';
export {
  contentsToObject,
  getByPath,
  mergeDataModelUpdate,
  normalizePathSegments,
  resolveBoundText,
  walkImplicitBoundInits,
  type DataEntry,
  type DataModelUpdatePayload
} from './dataModel';

export interface InitOptions {
  renderMap?: RenderMap;
  onRender?: (rootVNode: React.ReactElement) => void;
  /**
   * 两次渲染之间的最小间隔（毫秒），用于降低高频 surfaceUpdate 下的重绘次数。
   * 默认 400。设为 0 表示不节流。
   */
  renderThrottleMs?: number;
}

export function init(options?: InitOptions) {
  const store = createA2uiStore();
  
  if (options?.renderMap) {
    store.getState().setRenderMap(options.renderMap);
  }
  
  a2uiParser.setStore(store);
  a2uiParser.setRenderThrottleMs(options?.renderThrottleMs ?? 400);
  
  if (options?.onRender) {
    a2uiParser.setRenderCallback(options.onRender);
  }
  
  return store;
}

export { a2uiStore, a2uiParser, A2UIParser };
