import { expect } from 'chai';
import { readFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { a2uiParser, makeTemplateInstanceId, RenderMap, type A2UIMessage } from '../src/parser';
import { createA2uiStore } from '../src/store';

describe('List children.template', () => {
  let parserStore: ReturnType<typeof createA2uiStore>;

  beforeEach(() => {
    a2uiParser.resetRuntimeState();
    a2uiParser.setRenderThrottleMs(0);
    parserStore = createA2uiStore();
    const renderMap: RenderMap = {
      List: (props: any) =>
        React.createElement('div', {
          'data-testid': 'list',
          id: props.id
        }, props.children),
      Text: (props: any) =>
        React.createElement('span', {
          'data-testid': 'text',
          'data-display': props.text?.literalString ?? '',
          id: props.id
        })
    };
    parserStore.getState().setRenderMap(renderMap);
    a2uiParser.setStore(parserStore);
  });

  it('parseSurfaceUpdate sets childrenTemplate from mock', () => {
    const mock = JSON.parse(
      readFileSync(join(__dirname, '../mock/list-template-smoke.json'), 'utf-8')
    );
    a2uiParser.parseMessage({ beginRendering: mock.beginRendering });
    const r = a2uiParser.parseMessage({ surfaceUpdate: mock.surfaceUpdate });
    const listNode = r.hydrateNodes?.find((n) => n.componentId === 'root-list');
    expect(listNode).to.exist;
    expect(listNode!.childrenTemplate).to.deep.equal({
      dataBinding: '/items',
      templateComponentId: 'item-text-tpl'
    });
    expect(listNode!.children).to.be.undefined;
  });

  it('treeBuild expands template with unique synthetic ids and item-scoped Text', () => {
    const mock = JSON.parse(
      readFileSync(join(__dirname, '../mock/list-template-smoke.json'), 'utf-8')
    );
    const r = a2uiParser.parseMessage(mock as A2UIMessage);
    const hydrateNodes = r.hydrateNodes!;

    const tree = a2uiParser.treeBuild(hydrateNodes, mock.beginRendering.root);
    expect(tree.rootVNode).to.exist;
    const kids = tree.rootVNode!.props.children as React.ReactElement[];
    expect(kids).to.be.an('array');
    expect(kids).to.have.lengthOf(3);

    const id0 = makeTemplateInstanceId('root-list', 'item-text-tpl', 0);
    const id1 = makeTemplateInstanceId('root-list', 'item-text-tpl', 1);
    const id2 = makeTemplateInstanceId('root-list', 'item-text-tpl', 2);
    expect(kids[0].key).to.equal(id0);
    expect(kids[1].key).to.equal(id1);
    expect(kids[2].key).to.equal(id2);
    expect(kids[0].props.id).to.equal(id0);
    expect(kids[1].props.id).to.equal(id1);
    expect(kids[2].props.id).to.equal(id2);
    expect(kids[0].props['data-display']).to.equal('Item A');
    expect(kids[1].props['data-display']).to.equal('Item B');
    expect(kids[2].props['data-display']).to.equal('Item C');
  });
});
