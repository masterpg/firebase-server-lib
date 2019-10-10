import * as treeViewUtils from '@/components/comp-tree-view/comp-tree-view-utils'
import CompCheckboxNodeItem from '@/components/comp-tree-view/comp-checkbox-node-item.vue'
import CompTreeNode from '@/components/comp-tree-view/comp-tree-node.vue'
import { CompTreeNodeData } from '@/components/comp-tree-view/types'
import CompTreeView from '@/components/comp-tree-view/index.vue'
import { mount } from '@vue/test-utils'
const merge = require('lodash/merge')
const cloneDeep = require('lodash/cloneDeep')

//========================================================================
//
//  Test helpers
//
//========================================================================

function verifyTreeView(treeView: CompTreeView | any) {
  for (let i = 0; i < treeView.children.length; i++) {
    const node = treeView.children[i]
    // ノードにツリービューが設定されていることを検証
    expect(node.treeView).toBe(treeView)
    // ノードの親が空であることを検証
    expect(node.parent).toBeUndefined()
    // ツリービューのコンテナにノードが存在することを検証
    const containerChildren = Array.from(treeView.m_childContainer.children)
    expect(containerChildren[i]).toBe(node.$el)
    // ノードの親子(子孫)関係の検証
    verifyParentChildRelation(node)
    // ノードが選択状態の場合
    if (node.selected) {
      expect(treeView.selectedNode.selected).toBe(node)
    }
  }
  // 最年長ノードフラグの検証
  verifyIsEldest(treeView)
  // 選択ノードの検証
  if (treeView.selectedNode) {
    expect(treeView.selectedNode.selected).toBeTruthy()
    expect(treeView.selectedNode.item.selected).toBeTruthy()
  }
}

function verifyParentChildRelation(node: CompTreeNode | any) {
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i] as CompTreeNode | any
    // ノードの親子関係を検証
    expect(child.parent).toBe(node)
    // ノードのコンテナに子ノードが存在することを検証
    const containerChildren = Array.from(node.m_childContainer.children)
    expect(containerChildren[i]).toBe(child.$el)
    // 孫ノードの検証
    verifyParentChildRelation(child)
  }
}

function verifyIsEldest(treeView: CompTreeView | any) {
  treeView.children.forEach((node, index) => {
    const isEldest = index === 0
    expect(node.isEldest).toBe(isEldest)
  })
}

const sortFunc = (a: CompTreeNode | any, b: CompTreeNode | any) => {
  if (a.label < b.label) {
    return -1
  } else if (a.label > b.label) {
    return 1
  } else {
    return 0
  }
}

function getNodeData(nodeDataList: CompTreeNodeData[], value: string): CompTreeNodeData | undefined {
  for (let nodeData of nodeDataList) {
    if (nodeData.value === value) {
      return nodeData
    }
    if (nodeData.children) {
      const resultNodeData = getNodeData(nodeData.children, value)
      if (resultNodeData) return resultNodeData
    }
  }
  return undefined
}

function editNodeDataList(
  srcNodeDataList: CompTreeNodeData[],
  editDataList: Array<Partial<CompTreeNodeData> & { value: string }>
): CompTreeNodeData[] {
  const newNodeDataList = cloneDeep(srcNodeDataList)
  for (const editData of editDataList) {
    const nodeData = getNodeData(newNodeDataList, editData.value)
    merge(nodeData, editData)
  }
  return newNodeDataList
}

//========================================================================
//
//  Test data
//
//========================================================================

const nodeDataList = [
  {
    label: 'Node1',
    value: 'node1',
    opened: true,
    children: [
      {
        label: 'Node1_1',
        value: 'node1_1',
        opened: true,
        children: [
          {
            label: 'Node1_1_1',
            value: 'node1_1_1',
            icon: 'inbox',
            selected: true,
          },
          {
            label: 'Node1_1_2',
            value: 'node1_1_2',
            unselectable: true,
          },
          {
            label: 'Node1_1_3',
            value: 'node1_1_3',
          },
        ],
      },
    ],
  },
  {
    label: 'Node2',
    value: 'node2',
  },
]

//========================================================================
//
//  Tests
//
//========================================================================

describe('CompTreeView', () => {
  describe('buildTree()', () => {
    it('ベーシックケース', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1 = treeView.children[0]
      expect(node1.value).toBe('node1')
      expect(node1.label).toBe('Node1')
      expect(node1.isEldest).toBeTruthy()
      expect(node1.opened).toBe(true)
      expect(node1.selected).toBeFalsy()

      const node1_1 = node1.children[0]
      expect(node1_1.value).toBe('node1_1')
      expect(node1_1.label).toBe('Node1_1')
      expect(node1_1.selected).toBeFalsy()

      const node1_1_1 = node1_1.children[0]
      expect(node1_1_1.value).toBe('node1_1_1')
      expect(node1_1_1.label).toBe('Node1_1_1')
      expect(node1_1_1.icon).toBe('inbox')
      expect(node1_1_1.selected).toBeTruthy()
      expect(treeView.selectedNode).toBe(node1_1_1)

      const node1_1_2 = node1_1.children[1]
      expect(node1_1_2.value).toBe('node1_1_2')
      expect(node1_1_2.label).toBe('Node1_1_2')
      expect(node1_1_2.unselectable).toBe(true)
      expect(node1_1_2.selected).toBeFalsy()

      const node1_1_3 = node1_1.children[2]
      expect(node1_1_3.value).toBe('node1_1_3')
      expect(node1_1_3.label).toBe('Node1_1_3')
      expect(node1_1_3.selected).toBeFalsy()

      const node2 = treeView.children[1]
      expect(node2.value).toBe('node2')
      expect(node2.label).toBe('Node2')
      expect(node2.isEldest).not.toBeTruthy()
      expect(node2.selected).toBeFalsy()

      expect(treeView.$el).toMatchSnapshot()
    })

    it('先頭に挿入', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      treeView.buildTree(
        [
          {
            label: 'Node3',
            value: 'node3',
          },
          {
            label: 'Node4',
            value: 'node4',
          },
        ],
        0
      )

      const node3 = treeView.getNode('node3')
      const node4 = treeView.getNode('node4')

      expect(treeView.children[0]).toBe(node3)
      expect(treeView.children[1]).toBe(node4)
      verifyTreeView(treeView)
    })

    it('中間に挿入', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      treeView.buildTree(
        [
          {
            label: 'Node3',
            value: 'node3',
          },
          {
            label: 'Node4',
            value: 'node4',
          },
        ],
        1
      )

      const node3 = treeView.getNode('node3')
      const node4 = treeView.getNode('node4')

      expect(treeView.children[1]).toBe(node3)
      expect(treeView.children[2]).toBe(node4)
      verifyTreeView(treeView)
    })

    it('最後尾に挿入', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      treeView.buildTree(
        [
          {
            label: 'Node3',
            value: 'node3',
          },
          {
            label: 'Node4',
            value: 'node4',
          },
        ],
        treeView.children.length
      )

      const node3 = treeView.getNode('node3')
      const node4 = treeView.getNode('node4')

      expect(treeView.children[treeView.children.length - 2]).toBe(node3)
      expect(treeView.children[treeView.children.length - 1]).toBe(node4)
      verifyTreeView(treeView)
    })
  })

  describe('addChild()', () => {
    it('挿入位置の指定なし', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node3 = treeView.addChild({
        label: 'Node3',
        value: 'node3',
      })

      expect(treeView.getNode('node3')).toBe(node3)
      expect(treeView.children[treeView.children.length - 1]).toBe(node3)
      verifyTreeView(treeView)
    })

    it('先頭に挿入', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node3 = treeView.addChild(
        {
          label: 'Node3',
          value: 'node3',
        },
        { insertIndex: 0 }
      )

      expect(treeView.getNode('node3')).toBe(node3)
      expect(treeView.children[0]).toBe(node3)
      verifyTreeView(treeView)
    })

    it('中間に挿入', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node3 = treeView.addChild(
        {
          label: 'Node3',
          value: 'node3',
        },
        { insertIndex: 1 }
      )

      expect(treeView.getNode('node3')).toBe(node3)
      expect(treeView.children[1]).toBe(node3)
      verifyTreeView(treeView)
    })

    it('中間に挿入(sortFuncを使用)', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1p5 = treeView.addChild(
        {
          label: 'Node1.5',
          value: 'node1.5',
        },
        { sortFunc }
      )

      expect(treeView.getNode('node1.5')).toBe(node1p5)
      expect(treeView.children[1]).toBe(node1p5)
      verifyTreeView(treeView)
    })

    it('最後尾に挿入', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node3 = treeView.addChild(
        {
          label: 'Node3',
          value: 'node3',
        },
        { insertIndex: treeView.children.length }
      )

      expect(treeView.getNode('node3')).toBe(node3)
      expect(treeView.children[treeView.children.length - 1]).toBe(node3)
      verifyTreeView(treeView)
    })

    it('挿入位置にFloatを指定', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node3 = treeView.addChild(
        {
          label: 'Node3',
          value: 'node3',
        },
        { insertIndex: 1.5 }
      )

      expect(treeView.getNode('node3')).toBe(node3)
      // 最後尾に挿入される
      expect(treeView.children[treeView.children.length - 1]).toBe(node3)
      verifyTreeView(treeView)
    })

    it('挿入位置にFloat(実際はInteger)を指定', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node3 = treeView.addChild(
        {
          label: 'Node3',
          value: 'node3',
        },
        { insertIndex: 1.0 }
      )

      expect(treeView.getNode('node3')).toBe(node3)
      expect(treeView.children[1]).toBe(node3)
      verifyTreeView(treeView)
    })

    it('既に存在するノードを指定して追加', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      let actual!: Error
      try {
        treeView.addChild({
          label: 'Node2',
          value: 'node2',
        })
      } catch (err) {
        actual = err
      }

      expect(actual).toBeInstanceOf(Error)
      expect(actual.message).toBe('The node "node2" already exists.')
      verifyTreeView(treeView)
    })

    it('親ノードを指定', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1 = treeView.getNode('node1_1')
      const node1_1_x = treeView.addChild(
        {
          label: 'Node2_1',
          value: 'node2_1',
        },
        { parent: node1_1.value }
      )

      expect(node1_1_x.parent).toBe(node1_1)
      expect(node1_1.children[node1_1.children.length - 1]).toBe(node1_1_x)
      verifyTreeView(treeView)
    })

    it('親ノードと挿入位置を指定', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1 = treeView.getNode('node1_1')
      const node1_1_x = treeView.addChild(
        {
          label: 'Node2_1',
          value: 'node2_1',
        },
        { parent: node1_1.value, insertIndex: 1 }
      )

      expect(node1_1_x.parent).toBe(node1_1)
      expect(node1_1.children[1]).toBe(node1_1_x)
      verifyTreeView(treeView)
    })

    it('ノードを入れ替え', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1 = treeView.getNode('node1')
      const node2 = treeView.getNode('node2')

      treeView.addChild(node1)

      expect(treeView.children.length).toBe(2)
      expect(treeView.children[0]).toBe(node2)
      expect(treeView.children[1]).toBe(node1)
      verifyTreeView(treeView)
    })

    it('下位レベルのノードをトップレベルへ移動', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const treeViewNodesLength = treeView.children.length
      const node1_1 = treeView.getNode('node1_1')
      const node1 = node1_1.parent

      treeView.addChild(node1_1)

      expect(treeView.children.length).toBe(treeViewNodesLength + 1)
      expect(treeView.children[2]).toBe(node1_1)
      expect(node1_1.parent).toBeUndefined()
      expect(node1.children.includes(node1_1)).not.toBeTruthy()
      verifyTreeView(treeView)
    })

    it('存在しない親ノードを指定', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      let actual!: Error
      try {
        treeView.addChild(
          {
            label: 'Node2_1',
            value: 'node2_1',
          },
          { parent: 'nodeXXX' }
        )
      } catch (err) {
        actual = err
      }

      expect(actual).toBeInstanceOf(Error)
      expect(actual.message).toBe('The parent node "nodeXXX" does not exist.')
      verifyTreeView(treeView)
    })

    it('insertIndexとsortFuncの両方を指定', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      let actual!: Error
      try {
        const node3 = treeView.addChild(
          {
            label: 'Node3',
            value: 'node3',
          },
          { insertIndex: 0, sortFunc }
        )
      } catch (err) {
        actual = err
      }

      expect(actual).toBeInstanceOf(Error)
      expect(actual.message).toBe('You cannot specify both "insertIndex" and "sortFunc".')
      verifyTreeView(treeView)
    })
  })

  describe('removeNode()', () => {
    it('レベル1のノード(子孫ノード有り)を削除', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1 = treeView.getNode('node1')!
      const node1Descendants = treeViewUtils.getDescendants(node1)
      const treeViewNodesLength = treeView.children.length

      const actual = treeView.removeNode(node1.value)

      expect(actual).toBe(node1)
      expect(treeView.getNode(node1.value)).toBeUndefined()
      expect(treeView.children.length).toBe(treeViewNodesLength - 1)
      expect(Array.from(treeView.m_childContainer.children).includes(node1.$el)).not.toBeTruthy()

      for (const descendant of node1Descendants) {
        expect(treeView.getNode((descendant as any).value)).toBeUndefined()
      }

      verifyTreeView(treeView)
    })

    it('レベル2のノード(子ノード有り)を削除', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1 = treeView.getNode('node1_1')!
      const node1_1Descendants = treeViewUtils.getDescendants(node1_1)
      const node1 = node1_1.parent
      const node1ChildrenLength = node1.children.length

      const actual = treeView.removeNode(node1_1.value)

      expect(actual).toBe(node1_1)
      expect(treeView.getNode(node1_1.value)).toBeUndefined()
      expect(node1.children.length).toBe(node1ChildrenLength - 1)
      expect(node1.children.includes(node1_1)).not.toBeTruthy()
      expect(Array.from(node1.m_childContainer.children).includes(node1_1.$el)).not.toBeTruthy()

      for (const descendant of node1_1Descendants) {
        expect(treeView.getNode((descendant as any).value)).toBeUndefined()
      }

      verifyTreeView(treeView)
    })

    it('選択ノードを削除', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1_1 = treeView.getNode('node1_1_1')!
      expect(node1_1_1.selected).toBeTruthy()

      treeView.removeNode(node1_1_1.value)

      // イベント発火を検証
      expect(wrapper.emitted('unselected').length).toBe(1)
      expect(wrapper.emitted('unselected')[0][0]).toBe(node1_1_1)
      // ノードの選択状態を検証
      expect(treeView.selectedNode).toBeUndefined()
      expect(node1_1_1.selected).toBeFalsy()

      verifyTreeView(treeView)
    })

    it('存在しないノードを指定', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1 = treeView.removeNode('nodeXXX')

      expect(node1).toBeUndefined()
      verifyTreeView(treeView)
    })

    it('削除したノードを追加', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1 = treeView.getNode('node1')!
      const descendants = treeViewUtils.getDescendants(node1)
      const treeViewNodesLength = treeView.children.length

      const actual = treeView.removeNode(node1.value)
      treeView.addChild(actual, { insertIndex: 0 })

      expect(actual).toBe(node1)
      expect(treeView.getNode(node1.value)).toBe(node1)
      expect(treeView.children.length).toBe(treeViewNodesLength)
      expect(treeView.children[0]).toBe(node1)

      for (const descendant of descendants) {
        expect(treeView.getNode((descendant as any).value)).toBeTruthy()
      }

      verifyTreeView(treeView)
    })
  })

  describe('selectedNode', () => {
    it('選択ノードがある状態で取得', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1_1 = treeView.getNode('node1_1_1')
      const actual = treeView.selectedNode

      expect(actual).toBe(node1_1_1)
      verifyTreeView(treeView)
    })

    it('選択ノードがない状態で取得', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      const customNodeDataList = editNodeDataList(nodeDataList, [{ value: 'node1_1_1', selected: false }])
      treeView.buildTree(customNodeDataList)

      const actual = treeView.selectedNode

      expect(actual).toBeUndefined()
      verifyTreeView(treeView)
    })

    it('現在選択されているノードと同じノードを設定', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1_1 = treeView.getNode('node1_1_1')
      expect(node1_1_1.selected).toBeTruthy()

      treeView.selectedNode = node1_1_1

      // イベント発火を検証
      expect(wrapper.emitted('selected')).toBeUndefined()
      // ノードの選択状態を検証
      expect(treeView.selectedNode).toBe(node1_1_1)
      expect(node1_1_1.selected).toBeTruthy()

      verifyTreeView(treeView)
    })

    it('現在選択されているノードと別のノードを設定', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1_1 = treeView.getNode('node1_1_1')
      expect(node1_1_1.selected).toBeTruthy()
      const node1_1_3 = treeView.getNode('node1_1_3')
      expect(node1_1_3.selected).toBeFalsy()

      treeView.selectedNode = node1_1_3

      // イベント発火を検証
      expect(wrapper.emitted('unselected').length).toBe(1)
      expect(wrapper.emitted('unselected')[0][0]).toBe(node1_1_1)
      expect(wrapper.emitted('selected').length).toBe(1)
      expect(wrapper.emitted('selected')[0][0]).toBe(node1_1_3)
      // ノードの選択状態を検証
      expect(node1_1_1.selected).toBeFalsy()
      expect(treeView.selectedNode).toBe(node1_1_3)
      expect(node1_1_3.selected).toBeTruthy()

      verifyTreeView(treeView)
    })

    it('現在選択されているノードの選択解除', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1_1 = treeView.getNode('node1_1_1')
      expect(node1_1_1.selected).toBeTruthy()

      treeView.selectedNode = undefined

      // イベント発火を検証
      expect(wrapper.emitted('unselected').length).toBe(1)
      expect(wrapper.emitted('unselected')[0][0]).toBe(node1_1_1)
      // ノードの選択状態を検証
      expect(treeView.selectedNode).toBeUndefined()
      expect(node1_1_1.selected).toBeFalsy()

      verifyTreeView(treeView)
    })
  })

  it('ノードのvalueが空文字("")の場合', () => {
    const wrapper = mount(CompTreeView)
    const treeView = wrapper.vm as CompTreeView | any
    treeView.buildTree(nodeDataList)

    // valueが空文字("")のノードを作成
    treeView.buildTree(
      [
        {
          label: 'Anonymous',
          value: '',
        },
      ],
      treeView.children.length
    )
    const anonymous = treeView.getNode('')

    // 親に空文字("")のノードを指定
    const anonymous_child1 = treeView.addChild(
      {
        label: 'Anonymous_child1',
        value: 'anonymous_child1',
      },
      { parent: '' }
    )

    expect(treeView.children[treeView.children.length - 1]).toBe(anonymous)
    expect(anonymous.children[0]).toBe(anonymous_child1)
    expect(anonymous_child1.parent).toBe(anonymous)

    verifyTreeView(treeView)
  })
})

describe('CompTreeNode', () => {
  describe('addChild()', () => {
    it('挿入位置の指定なし', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1 = treeView.getNode('node1_1')!

      const node1_1_4 = node1_1.addChild({
        label: 'Node1_1_4',
        value: 'node1_1_4',
      })

      expect(treeView.getNode('node1_1_4')).toBe(node1_1_4)
      expect(node1_1.children[node1_1.children.length - 1]).toBe(node1_1_4)
      verifyTreeView(treeView)
    })

    it('先頭に挿入', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1 = treeView.getNode('node1_1')!

      const node1_1_4 = node1_1.addChild(
        {
          label: 'Node1_1_4',
          value: 'node1_1_4',
        },
        { insertIndex: 0 }
      )

      expect(treeView.getNode('node1_1_4')).toBe(node1_1_4)
      expect(node1_1.children[0]).toBe(node1_1_4)
      verifyTreeView(treeView)
    })

    it('中間に挿入', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1 = treeView.getNode('node1_1')!

      const node1_1_4 = node1_1.addChild(
        {
          label: 'Node1_1_4',
          value: 'node1_1_4',
        },
        { insertIndex: 1 }
      )

      expect(treeView.getNode('node1_1_4')).toBe(node1_1_4)
      expect(node1_1.children[1]).toBe(node1_1_4)
      verifyTreeView(treeView)
    })

    it('中間に挿入(sortFuncを使用)', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1 = treeView.getNode('node1_1')!

      const node1_1_1p5 = node1_1.addChild(
        {
          label: 'Node1_1_1.5',
          value: 'node1_1_1.5',
        },
        { sortFunc }
      )

      expect(treeView.getNode('node1_1_1.5')).toBe(node1_1_1p5)
      expect(node1_1.children[1]).toBe(node1_1_1p5)
      verifyTreeView(treeView)
    })

    it('最後尾に挿入', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1 = treeView.getNode('node1_1')!

      const node1_1_4 = node1_1.addChild(
        {
          label: 'Node1_1_4',
          value: 'node1_1_4',
        },
        { insertIndex: node1_1.children.length }
      )

      expect(treeView.getNode('node1_1_4')).toBe(node1_1_4)
      expect(node1_1.children[node1_1.children.length - 1]).toBe(node1_1_4)
      verifyTreeView(treeView)
    })

    it('挿入位置にFloatを指定', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1 = treeView.getNode('node1_1')!

      const node1_1_4 = node1_1.addChild(
        {
          label: 'Node1_1_4',
          value: 'node1_1_4',
        },
        { insertIndex: 1.5 }
      )

      expect(treeView.getNode('node1_1_4')).toBe(node1_1_4)
      // 最後尾に挿入される
      expect(node1_1.children[node1_1.children.length - 1]).toBe(node1_1_4)
      verifyTreeView(treeView)
    })

    it('挿入位置にFloat(実際はInteger)を指定', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1 = treeView.getNode('node1_1')!

      const node1_1_4 = node1_1.addChild(
        {
          label: 'Node1_1_4',
          value: 'node1_1_4',
        },
        { insertIndex: 1 }
      )

      expect(treeView.getNode('node1_1_4')).toBe(node1_1_4)
      expect(node1_1.children[1]).toBe(node1_1_4)
      verifyTreeView(treeView)
    })

    it('ノードを入れ替え', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1 = treeView.getNode('node1_1')
      const node1_1_1 = treeView.getNode('node1_1_1')
      const node1_1_2 = treeView.getNode('node1_1_2')

      node1_1.addChild(node1_1_1)

      expect(node1_1.children.length).toBe(3)
      expect(node1_1.children[0]).toBe(node1_1_2)
      expect(node1_1.children[node1_1.children.length - 1]).toBe(node1_1_1)
      verifyTreeView(treeView)
    })

    it('トップレベルのノードを下位レベルへ移動', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const treeViewNodesLength = treeView.children.length
      const node1 = treeView.getNode('node1')
      const node2 = treeView.getNode('node2')
      const node2ChildrenLength = node2.children.length

      node2.addChild(node1)

      expect(treeView.children.length).toBe(treeViewNodesLength - 1)
      expect(treeView.children[0]).toBe(node2)
      expect(node2.children.length).toBe(node2ChildrenLength + 1)
      expect(node2.children[0]).toBe(node1)
      expect(node1.parent).toBe(node2)
      verifyTreeView(treeView)
    })

    it('既に存在するノードを指定して追加', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1 = treeView.getNode('node1')

      let actual!: Error
      try {
        node1.addChild({
          label: 'Node1_1',
          value: 'node1_1',
        })
      } catch (err) {
        actual = err
      }

      expect(actual).toBeInstanceOf(Error)
      expect(actual.message).toBe('The node "node1_1" already exists.')
      verifyTreeView(treeView)
    })

    it('追加しようとするノードの子に自ノード(新しく親となるノード)が含まれている場合', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1 = treeView.getNode('node1')
      const node1_1 = treeView.getNode('node1_1')

      let actual!: Error
      try {
        node1_1.addChild(node1)
      } catch (err) {
        actual = err
      }

      expect(actual).toBeInstanceOf(Error)
      expect(actual.message).toBe(`The specified node "${node1.value}" contains the new parent "${node1_1.value}".`)
      verifyTreeView(treeView)
    })

    it('insertIndexとsortFuncの両方を指定', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1 = treeView.getNode('node1_1')!

      let actual!: Error
      try {
        const node1_1_4 = node1_1.addChild(
          {
            label: 'Node1_1_4',
            value: 'node1_1_4',
          },
          { insertIndex: 0, sortFunc }
        )
      } catch (err) {
        actual = err
      }

      expect(actual).toBeInstanceOf(Error)
      expect(actual.message).toBe('You cannot specify both "insertIndex" and "sortFunc".')
      verifyTreeView(treeView)
    })
  })

  describe('removeChild()', () => {
    it('ベーシックケース', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1 = treeView.getNode('node1_1')!
      const node1_1Descendants = treeViewUtils.getDescendants(node1_1)
      const node1 = node1_1.parent
      const node1ChildrenLength = node1.children.length

      node1.removeChild(node1_1)

      expect(treeView.getNode(node1_1.value)).toBeUndefined()
      expect(node1.children.length).toBe(node1ChildrenLength - 1)
      expect(node1.children.includes(node1_1)).not.toBeTruthy()
      expect(Array.from(node1.m_childContainer.children).includes(node1_1.$el)).not.toBeTruthy()

      for (const descendant of node1_1Descendants) {
        expect(treeView.getNode((descendant as any).value)).toBeUndefined()
      }

      verifyTreeView(treeView)
    })

    it('選択ノードを削除', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1_1 = treeView.getNode('node1_1_1')!
      expect(node1_1_1.selected).toBeTruthy()
      const node1_1 = node1_1_1.parent

      node1_1.removeChild(node1_1_1)

      // イベント発火を検証
      expect(wrapper.emitted('unselected').length).toBe(1)
      expect(wrapper.emitted('unselected')[0][0]).toBe(node1_1_1)
      // ノードの選択状態を検証
      expect(treeView.selectedNode).toBeUndefined()
      expect(node1_1_1.selected).toBeFalsy()

      verifyTreeView(treeView)
    })

    it('存在しないノードを指定', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1 = treeView.getNode('node1_1')
      const node1 = node1_1.parent

      // node1_1を削除
      treeView.removeNode(node1_1.value)
      expect(node1.children.includes(node1_1)).not.toBeTruthy()
      expect(Array.from(node1.m_childContainer.children).includes(node1_1.$el)).not.toBeTruthy()

      // 存在しないノード(削除したnode1_1)をさらに削除
      // (何も起こらない)
      node1.removeChild(node1_1)

      verifyTreeView(treeView)
    })

    it('削除したノードを追加', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1 = treeView.getNode('node1_1')!
      const node1_1Descendants = treeViewUtils.getDescendants(node1_1)
      const node1 = node1_1.parent
      const node1ChildrenLength = node1.children.length

      node1.removeChild(node1_1)
      const actual = node1.addChild(node1_1, { insertIndex: 0 })

      expect(actual).toBe(node1_1)
      expect(treeView.getNode(node1_1.value)).toBe(node1_1)
      expect(node1.children.length).toBe(node1ChildrenLength)
      expect(node1.children[0]).toBe(node1_1)

      for (const descendant of node1_1Descendants) {
        expect(treeView.getNode((descendant as any).value)).toBeTruthy()
      }

      verifyTreeView(treeView)
    })
  })

  it('valueを変更', () => {
    const wrapper = mount(CompTreeView)
    const treeView = wrapper.vm as CompTreeView | any
    treeView.buildTree(nodeDataList)

    const node1_1_1 = treeView.getNode('node1_1_1')
    const oldValue = node1_1_1.value
    const newValue = `${node1_1_1.value}_changed`
    node1_1_1.value = newValue

    // ノードの値を検証
    expect(node1_1_1.value).toBe(newValue)
    expect(node1_1_1.item.value).toBe(newValue)
    // ツリービューの検証
    expect(treeView.getNode(oldValue)).toBeUndefined()
    expect(treeView.getNode(newValue)).toBe(node1_1_1)
  })

  it('子ノード開閉', () => {
    const wrapper = mount(CompTreeView)
    const treeView = wrapper.vm as CompTreeView | any
    treeView.buildTree(nodeDataList)

    const node1_1 = treeView.getNode('node1_1')!
    expect(node1_1.opened).toBe(true)

    node1_1.open()
    node1_1.close()
    node1_1.toggle()

    // イベント発火を検証
    expect(wrapper.emitted('opened-changed').length).toBe(3) // イベント3回発火される想定
    expect(wrapper.emitted('opened-changed')[2][0]).toBe(node1_1)
    // ノードの開閉状態を検証
    expect(node1_1.opened).toBeTruthy()
  })

  describe('selected', () => {
    it('選択ノードがない状態から選択を設定', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      const customNodeDataList = editNodeDataList(cloneDeep(nodeDataList), [{ value: 'node1_1_1', selected: false }])
      treeView.buildTree(customNodeDataList)

      const node1_1_1 = treeView.getNode('node1_1_1')
      expect(node1_1_1.selected).toBeFalsy()

      node1_1_1.selected = true

      // イベント発火を検証
      expect(wrapper.emitted('selected').length).toBe(1)
      expect(wrapper.emitted('selected')[0][0]).toBe(node1_1_1)
      // ノードの選択状態を検証
      expect(node1_1_1.selected).toBeTruthy()

      verifyTreeView(treeView)
    })

    it('現在選択されているノードと同じノードを選択', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1_1 = treeView.getNode('node1_1_1')
      expect(node1_1_1.selected).toBeTruthy()

      node1_1_1.selected = true

      // イベント発火を検証
      expect(wrapper.emitted('selected')).toBeUndefined()
      // ノードの選択状態を検証
      expect(node1_1_1.selected).toBeTruthy()

      verifyTreeView(treeView)
    })

    it('現在選択されているノードとは別のノードを選択', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1_1 = treeView.getNode('node1_1_1')
      expect(node1_1_1.selected).toBeTruthy()
      const node1_1_3 = treeView.getNode('node1_1_3')
      expect(node1_1_3.selected).toBeFalsy()

      node1_1_3.selected = true

      // イベント発火を検証
      expect(wrapper.emitted('unselected').length).toBe(1)
      expect(wrapper.emitted('unselected')[0][0]).toBe(node1_1_1)
      expect(wrapper.emitted('selected').length).toBe(1)
      expect(wrapper.emitted('selected')[0][0]).toBe(node1_1_3)
      // ノードの選択状態を検証
      expect(node1_1_1.selected).toBeFalsy()
      expect(node1_1_3.selected).toBeTruthy()

      verifyTreeView(treeView)
    })

    it('選択されているノードの選択を解除', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1_1 = treeView.getNode('node1_1_1')
      expect(node1_1_1.selected).toBeTruthy()

      node1_1_1.selected = false

      // イベント発火を検証
      expect(wrapper.emitted('unselected').length).toBe(1)
      expect(wrapper.emitted('unselected')[0][0]).toBe(node1_1_1)
      // ノードの選択状態を検証
      expect(node1_1_1.selected).toBeFalsy()

      verifyTreeView(treeView)
    })

    it('選択不可ノードに選択を設定', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1_1 = treeView.getNode('node1_1_1')
      expect(node1_1_1.selected).toBeTruthy()
      const node1_1_2 = treeView.getNode('node1_1_2')
      expect(node1_1_2.unselectable).toBeTruthy()
      expect(node1_1_2.selected).toBeFalsy()

      node1_1_2.selected = true

      // イベント発火を検証
      expect(wrapper.emitted('selected')).toBeUndefined()
      // ノードの選択状態を検証
      expect(node1_1_1.selected).toBeTruthy()
      expect(node1_1_2.selected).toBeFalsy()
    })
  })

  describe('setEditData()', () => {
    it('labelを変更', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1_1 = treeView.getNode('node1_1_1')
      const newLabel = `${node1_1_1.label}_xxx`

      node1_1_1.setEditData({ label: newLabel })

      expect(node1_1_1.label).toBe(newLabel)
      verifyTreeView(treeView)
    })

    it('valueを変更', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1_1 = treeView.getNode('node1_1_1')
      const newValue = `${node1_1_1.label}_xxx`
      const oldValue = node1_1_1.value

      node1_1_1.setEditData({ value: newValue })

      expect(node1_1_1.value).toBe(newValue)
      expect(treeView.getNode(newValue)).toBe(node1_1_1)
      expect(treeView.getNode(oldValue)).toBeUndefined()
      verifyTreeView(treeView)
    })

    it('iconを変更', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1_1 = treeView.getNode('node1_1_1')
      const newIcon = 'description'

      node1_1_1.setEditData({ icon: newIcon })

      expect(node1_1_1.icon).toBe(newIcon)
      verifyTreeView(treeView)
    })

    it('iconColorを変更', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1_1 = treeView.getNode('node1_1_1')
      const newIconColor = 'indigo-5'

      node1_1_1.setEditData({ iconColor: newIconColor })

      expect(node1_1_1.iconColor).toBe(newIconColor)
      verifyTreeView(treeView)
    })

    it('openedを変更(trueを設定)', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      const customNodeDataList = editNodeDataList(nodeDataList, [{ value: 'node1_1_1', opened: false }])
      treeView.buildTree(customNodeDataList)

      const node1_1_1 = treeView.getNode('node1_1_1')
      expect(node1_1_1.opened).toBe(false)

      node1_1_1.setEditData({ opened: true })

      expect(node1_1_1.opened).toBe(true)
      verifyTreeView(treeView)
    })

    it('openedを変更(falseを設定)', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      const customNodeDataList = editNodeDataList(nodeDataList, [{ value: 'node1_1_1', opened: true }])
      treeView.buildTree(customNodeDataList)

      const node1_1_1 = treeView.getNode('node1_1_1')
      expect(node1_1_1.opened).toBe(true)

      node1_1_1.setEditData({ opened: false })

      expect(node1_1_1.opened).toBe(false)
      verifyTreeView(treeView)
    })

    it('unselectableを変更(選択可能から選択不可へ)', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      const customNodeDataList = editNodeDataList(nodeDataList, [{ value: 'node1_1_1', selected: false }])
      treeView.buildTree(customNodeDataList)

      const node1_1_1 = treeView.getNode('node1_1_1')
      expect(node1_1_1.unselectable).toBeFalsy()
      expect(node1_1_1.selected).toBeFalsy()

      node1_1_1.setEditData({ unselectable: true })

      // イベント発火を検証
      expect(wrapper.emitted('unselected')).toBeUndefined()
      // ノードの選択状態を検証
      expect(node1_1_1.unselectable).toBeTruthy()
      expect(node1_1_1.selected).toBeFalsy()

      verifyTreeView(treeView)
    })

    it('unselectableを変更(選択不可から選択可能へ)', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      const customNodeDataList = editNodeDataList(nodeDataList, [{ value: 'node1_1_1', unselectable: true, selected: false }])
      treeView.buildTree(customNodeDataList)

      const node1_1_1 = treeView.getNode('node1_1_1')
      expect(node1_1_1.unselectable).toBeTruthy()
      expect(node1_1_1.selected).toBeFalsy()

      node1_1_1.setEditData({ unselectable: false })

      // イベント発火を検証
      expect(wrapper.emitted('unselected')).toBeUndefined()
      expect(wrapper.emitted('selected')).toBeUndefined()
      // ノードの選択状態を検証
      expect(node1_1_1.unselectable).toBeFalsy()
      expect(node1_1_1.selected).toBeFalsy()

      verifyTreeView(treeView)
    })

    it('unselectableを変更(｢選択可能+選択状態｣から選択不可へ)', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1_1 = treeView.getNode('node1_1_1')
      expect(node1_1_1.unselectable).toBeFalsy()
      expect(node1_1_1.selected).toBeTruthy()

      node1_1_1.setEditData({ unselectable: true })

      // イベント発火を検証
      expect(wrapper.emitted('unselected').length).toBe(1)
      expect(wrapper.emitted('unselected')[0][0]).toBe(node1_1_1)
      // ノードの選択状態を検証
      expect(node1_1_1.unselectable).toBeTruthy()
      expect(node1_1_1.selected).toBeFalsy()

      verifyTreeView(treeView)
    })

    it('selectedを変更(未選択から選択へ)', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      const customNodeDataList = editNodeDataList(nodeDataList, [{ value: 'node1_1_1', selected: false }])
      treeView.buildTree(customNodeDataList)

      const node1_1_1 = treeView.getNode('node1_1_1')
      expect(node1_1_1.unselectable).toBeFalsy()
      expect(node1_1_1.selected).toBeFalsy()

      node1_1_1.setEditData({ selected: true })

      // イベント発火を検証
      expect(wrapper.emitted('selected').length).toBe(1)
      expect(wrapper.emitted('selected')[0][0]).toBe(node1_1_1)
      // ノードの選択状態を検証
      expect(node1_1_1.selected).toBeTruthy()

      verifyTreeView(treeView)
    })

    it('selectedを変更(選択から選択へ、つまり変更なし)', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1_1 = treeView.getNode('node1_1_1')
      expect(node1_1_1.unselectable).toBeFalsy()
      expect(node1_1_1.selected).toBeTruthy()

      node1_1_1.setEditData({ selected: true })

      // イベント発火を検証
      expect(wrapper.emitted('selected')).toBeUndefined()
      // ノードの選択状態を検証
      expect(node1_1_1.selected).toBeTruthy()

      verifyTreeView(treeView)
    })

    it('selectedを変更(選択から未選択へ)', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      treeView.buildTree(nodeDataList)

      const node1_1_1 = treeView.getNode('node1_1_1')
      expect(node1_1_1.unselectable).toBeFalsy()
      expect(node1_1_1.selected).toBeTruthy()

      node1_1_1.setEditData({ selected: false })

      // イベント発火を検証
      expect(wrapper.emitted('unselected').length).toBe(1)
      expect(wrapper.emitted('unselected')[0][0]).toBe(node1_1_1)
      // ノードの選択状態を検証
      expect(node1_1_1.selected).toBeFalsy()

      verifyTreeView(treeView)
    })

    it('selectedを変更(選択不可ノードに選択を設定)', () => {
      const wrapper = mount(CompTreeView)
      const treeView = wrapper.vm as CompTreeView | any
      const customNodeDataList = editNodeDataList(nodeDataList, [{ value: 'node1_1_1', unselectable: true, selected: false }])
      treeView.buildTree(customNodeDataList)

      const node1_1_1 = treeView.getNode('node1_1_1')
      expect(node1_1_1.unselectable).toBeTruthy()
      expect(node1_1_1.selected).toBeFalsy()

      node1_1_1.setEditData({ selected: true })

      // イベント発火を検証
      expect(wrapper.emitted('selected')).toBeUndefined()
      // ノードの選択状態を検証
      expect(node1_1_1.selected).toBeFalsy()

      verifyTreeView(treeView)
    })
  })
})

describe('カスタムツリー', () => {
  const nodeDataList = [
    {
      label: 'Node1',
      value: 'node1',
      children: [
        {
          label: 'Node1_1',
          value: 'node1_1',
          children: [
            {
              label: 'Node1_1_1',
              value: 'node1_1_1',
              checked: true,
              itemClass: CompCheckboxNodeItem,
            },
          ],
        },
      ],
    },
  ]

  it('独自イベントが発火されるかを検証', () => {
    const wrapper = mount(CompTreeView)
    const treeView = wrapper.vm as CompTreeView | any
    treeView.buildTree(nodeDataList)

    const node1_1_1 = treeView.getNode('node1_1_1')!
    expect(node1_1_1.item.checked).toBe(true)

    node1_1_1.item.checked = false

    // イベント発火を検証
    expect(wrapper.emitted('checked-changed').length).toBe(1)
    expect(wrapper.emitted('checked-changed')[0][0]).toBe(node1_1_1)
    // ノードのチェック状態を検証
    expect(node1_1_1.item.checked).not.toBeTruthy()
  })
})
