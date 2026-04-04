import { A2UIMessage } from 'a2ui-core';

export const complexNestedTreeJsonl: A2UIMessage[] = [
  {
    beginRendering: {
      surfaceId: 'surface-001',
      root: 'root-column'
    }
  },
  {
    surfaceUpdate: {
      surfaceId: 'surface-001',
      components: [
        {
          id: 'root-column',
          component: {
            Column: {
              children: {
                explicitList: ['main-title', 'level2-column'],
                template: null
              },
              distribution: 'start',
              alignment: 'center'
            }
          }
        }
      ]
    }
  },
  {
    surfaceUpdate: {
      surfaceId: 'surface-001',
      components: [
        {
          id: 'main-title',
          component: {
            Text: {
              text: {
                literalString: 'Main Title - Level 1'
              },
              usageHint: 'h1'
            }
          }
        }
      ]
    }
  },
  {
    surfaceUpdate: {
      surfaceId: 'surface-001',
      components: [
        {
          id: 'level2-column',
          component: {
            Column: {
              children: {
                explicitList: ['sub-title', 'level3-column'],
                template: null
              },
              distribution: 'start',
              alignment: 'center'
            }
          }
        }
      ]
    }
  },
  {
    surfaceUpdate: {
      surfaceId: 'surface-001',
      components: [
        {
          id: 'sub-title',
          component: {
            Text: {
              text: {
                literalString: 'Sub Title - Level 2'
              },
              usageHint: 'h2'
            }
          }
        }
      ]
    }
  },
  {
    surfaceUpdate: {
      surfaceId: 'surface-001',
      components: [
        {
          id: 'level3-column',
          component: {
            Column: {
              children: {
                explicitList: ['text-1', 'text-2', 'text-3'],
                template: null
              },
              distribution: 'start',
              alignment: 'center'
            }
          }
        }
      ]
    }
  },
  {
    surfaceUpdate: {
      surfaceId: 'surface-001',
      components: [
        {
          id: 'text-1',
          component: {
            Text: {
              text: {
                literalString: 'First Text Component - Level 3'
              },
              usageHint: 'h3'
            }
          }
        }
      ]
    }
  },
  {
    surfaceUpdate: {
      surfaceId: 'surface-001',
      components: [
        {
          id: 'text-2',
          component: {
            Text: {
              text: {
                literalString: 'Second Text Component - Level 3'
              },
              usageHint: 'h3'
            }
          }
        }
      ]
    }
  },
  {
    surfaceUpdate: {
      surfaceId: 'surface-001',
      components: [
        {
          id: 'text-3',
          component: {
            Text: {
              text: {
                literalString: 'Third Text Component - Level 3'
              },
              usageHint: 'h3'
            }
          }
        }
      ]
    }
  }
];
