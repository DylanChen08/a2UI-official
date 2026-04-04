import { expect } from 'chai';
import { readFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import {
  contentsToObject,
  getByPath,
  mergeDataModelUpdate,
  normalizePathSegments,
  resolveBoundText,
  type DataEntry
} from '../src/dataModel';
import { a2uiParser, RenderMap } from '../src/parser';
import { createA2uiStore } from '../src/store';

describe('dataModel utils', () => {
  it('contentsToObject maps adjacency list to nested object', () => {
    const contents: DataEntry[] = [
      { key: 'title', valueString: 'T' },
      { key: 'n', valueNumber: 42 },
      { key: 'ok', valueBoolean: true },
      {
        key: 'meta',
        valueMap: [
          { key: 'a', valueString: 'x' },
          { key: 'b', valueNumber: 1 }
        ]
      }
    ];
    const o = contentsToObject(contents);
    expect(o.title).to.equal('T');
    expect(o.n).to.equal(42);
    expect(o.ok).to.equal(true);
    expect((o.meta as Record<string, unknown>).a).to.equal('x');
    expect((o.meta as Record<string, unknown>).b).to.equal(1);
  });

  it('normalizePathSegments strips slashes', () => {
    expect(normalizePathSegments('/doc/title')).to.deep.equal(['doc', 'title']);
    expect(normalizePathSegments('doc/title')).to.deep.equal(['doc', 'title']);
  });

  it('getByPath reads nested values', () => {
    const root = { doc: { title: 'Hi' } };
    expect(getByPath(root, '/doc/title')).to.equal('Hi');
    expect(getByPath(root, 'doc/title')).to.equal('Hi');
  });

  it('mergeDataModelUpdate replaces root when path empty', () => {
    const next = mergeDataModelUpdate({ old: 1 }, undefined, [
      { key: 'a', valueString: 'x' }
    ]);
    expect(next).to.deep.equal({ a: 'x' });
  });

  it('mergeDataModelUpdate merges at path', () => {
    const existing = { other: 1 };
    const next = mergeDataModelUpdate(existing, '/user', [
      { key: 'name', valueString: 'Ann' }
    ]) as Record<string, unknown>;
    expect(next.other).to.equal(1);
    expect((next.user as Record<string, unknown>).name).to.equal('Ann');
  });

  it('mergeDataModelUpdate: nested MapEntry.valueMap builds cart.items rows for List template', () => {
    const contents: DataEntry[] = [
      {
        key: 'items',
        valueMap: [
          {
            key: '0',
            valueMap: [{ key: 'line', valueString: 'A × 1    ¥1' }]
          },
          {
            key: '1',
            valueMap: [{ key: 'line', valueString: 'B × 2    ¥2' }]
          }
        ]
      }
    ];
    const next = mergeDataModelUpdate(undefined, '/cart', contents) as Record<string, unknown>;
    const cart = next.cart as Record<string, unknown>;
    const items = cart.items as Record<string, { line: string }>;
    expect(Object.keys(items)).to.deep.equal(['0', '1']);
    expect(items['0'].line).to.equal('A × 1    ¥1');
    expect(getByPath(next, '/cart/items')).to.equal(items);
    const vals = Object.values(items);
    expect(vals.map((r) => r.line)).to.deep.equal(['A × 1    ¥1', 'B × 2    ¥2']);
  });

  it('resolveBoundText prefers model when path is set', () => {
    const model = { doc: { title: 'From store' } };
    expect(
      resolveBoundText(
        { path: '/doc/title', literalString: '(loading)' },
        model
      )
    ).to.equal('From store');
  });

  it('resolveBoundText uses literal when path missing in model', () => {
    expect(
      resolveBoundText({ path: '/missing', literalString: 'fallback' }, {})
    ).to.equal('fallback');
  });
});

describe('parser + dataModel + binding (smoke)', () => {
  let parserStore: ReturnType<typeof createA2uiStore>;

  beforeEach(() => {
    a2uiParser.resetRuntimeState();
    a2uiParser.setRenderThrottleMs(0);
    parserStore = createA2uiStore();
    const renderMap: RenderMap = {
      Text: (props: any) =>
        React.createElement('span', {
          'data-testid': 'text',
          'data-display': props.text?.literalString ?? '',
          id: props.id
        }),
      Column: (props: any) =>
        React.createElement(
          'div',
          { 'data-testid': 'column', id: props.id },
          props.children
        )
    };
    parserStore.getState().setRenderMap(renderMap);
    a2uiParser.setStore(parserStore);
  });

  it('applies combined mock JSON: implicit init then dataModelUpdate resolves Text from store', () => {
    const raw = readFileSync(
      join(__dirname, '../mock/data-binding-smoke.json'),
      'utf-8'
    );
    const combined = JSON.parse(raw) as {
      beginRendering?: unknown;
      surfaceUpdate?: unknown;
      dataModelUpdate?: unknown;
    };

    let lastRoot: React.ReactElement | undefined;

    a2uiParser.setRenderCallback((root) => {
      lastRoot = root;
    });

    a2uiParser.parseMessage(combined as any);

    const dm = parserStore.getState().getDataModel('surface-dm') as Record<string, unknown>;
    expect((dm.doc as Record<string, unknown>).title).to.equal('Hello from data model');

    expect(lastRoot).to.exist;
    const findText = (el: React.ReactElement): React.ReactElement | null => {
      if (el.props?.['data-testid'] === 'text') return el;
      const ch = el.props?.children;
      if (!ch) return null;
      const arr = React.Children.toArray(ch) as React.ReactElement[];
      for (const c of arr) {
        if (React.isValidElement(c)) {
          const found = findText(c);
          if (found) return found;
        }
      }
      return null;
    };
    const textEl = findText(lastRoot!);
    expect(textEl).to.exist;
    expect(textEl!.props['data-display']).to.equal('Hello from data model');
  });

  it('surfaceUpdate with path+literal writes implicit value then render uses store', () => {
    const testStore = createA2uiStore();
    const renderMap: RenderMap = {
      Text: (props: any) =>
        React.createElement('span', {
          'data-display': props.text?.literalString ?? '',
          id: props.id
        })
    };
    testStore.getState().setRenderMap(renderMap);
    a2uiParser.setStore(testStore);
    a2uiParser.setRenderThrottleMs(0);

    a2uiParser.parseMessage({
      surfaceUpdate: {
        surfaceId: 's1',
        components: [
          {
            id: 't1',
            component: {
              Text: {
                text: { path: '/msg/body', literalString: 'default' },
                usageHint: 'body'
              }
            }
          }
        ]
      }
    });

    const m = testStore.getState().getDataModel('s1') as Record<string, unknown>;
    expect((m.msg as Record<string, unknown>).body).to.equal('default');

    let vnode: React.ReactElement | undefined;
    a2uiParser.setRenderCallback((r) => {
      vnode = r;
    });
    a2uiParser.parseMessage({
      dataModelUpdate: {
        surfaceId: 's1',
        path: '/msg',
        contents: [{ key: 'body', valueString: 'updated' }]
      }
    });

    expect(vnode).to.exist;
    const walk = (el: React.ReactElement): string | undefined => {
      if (el.props?.['data-display'] !== undefined)
        return el.props['data-display'] as string;
      const ch = el.props?.children;
      if (!ch) return undefined;
      for (const c of React.Children.toArray(ch)) {
        if (React.isValidElement(c)) {
          const d = walk(c);
          if (d !== undefined) return d;
        }
      }
      return undefined;
    };
    expect(walk(vnode!)).to.equal('updated');
  });
});
