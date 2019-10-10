<style lang="stylus" scoped>
@import '../../styles/app.variables.styl'

.child-container {
  color: var(--comp-tree-view-color, $indigo-8)
  font-size: var(--comp-tree-view-font-size, 14px)
  font-weight: var(--comp-tree-font-weight, $text-weights.medium)
  line-height: var(--comp-tree-line-height, 26px)
  padding: var(--comp-tree-padding, 10px)
}
</style>

<template>
  <div
    ref="childContainer"
    class="child-container"
    :style="{ minWidth: m_minWidth + 'px' }"
    @opened-changed="m_allNodesOnOpenedChanged"
    @node-added="m_nodeAdded"
    @node-before-removed="m_nodeBeforeRemoved"
    @node-removed="m_nodeRemoved"
    @selected-changed="m_allNodesOnSelectedChanged"
    @node-property-changed="m_allNodesOnNodePropertyChanged"
  ></div>
</template>

<script lang="ts">
import * as treeViewUtils from '@/components/comp-tree-view/comp-tree-view-utils'
import { BaseComponent, NoCache } from '@/components'
import { ChildrenSortFunc, CompTreeNodeData } from '@/components/comp-tree-view/types'
import CompCheckboxNodeItem, { CompCheckboxTreeNodeData } from '@/components/comp-tree-view/comp-checkbox-node-item.vue'
import CompTreeNode from '@/components/comp-tree-view/comp-tree-node.vue'
import CompTreeNodeItem from '@/components/comp-tree-view/comp-tree-node-item.vue'
import { Component } from 'vue-property-decorator'
import { NodePropertyChangeDetail } from '@/components/comp-tree-view/comp-tree-view-utils'
import Vue from 'vue'
const isInteger = require('lodash/isInteger')
const isFunction = require('lodash/isFunction')
const isString = require('lodash/isString')

export { CompTreeNodeData, CompTreeNode, CompTreeNodeItem, CompCheckboxNodeItem, CompCheckboxTreeNodeData }

/**
 * ツリーコンポーネントです。
 *
 * Custom property | Description | Default
 * ----------------|-------------|----------
 * `--comp-tree-distance` | ノードとノードの縦の間隔です | `6px`
 * `--comp-tree-indent` | ノードの左インデントです | `16px`
 * `--comp-tree-view-font-size` | ノードアイテムのフォントサイズです | `14px`
 * `--comp-tree-font-weight` | ノードアイテムのフォントの太さです | `500`
 * `--comp-tree-line-height` | ノードアイテムの行の高さです | `26px`
 * `--comp-tree-view-color` | ノードの文字色です | `indigo-8`
 * `--comp-tree-selected-color` | ノード選択時の文字色です | `pink-5`
 * `--comp-tree-unselectable-color` | 非選択ノードの文字色です | `grey-9`
 * `--comp-tree-padding` | ツリービューのpaddingです | `10px`
 */
@Component({ name: 'comp-tree-view' })
export default class CompTreeView<NodeData extends CompTreeNodeData = any> extends BaseComponent {
  //----------------------------------------------------------------------
  //
  //  Properties
  //
  //----------------------------------------------------------------------

  private m_children: CompTreeNode[] = []

  /**
   * ツリービューのトップレベルのノードです。
   */
  get children(): CompTreeNode[] {
    return this.m_children
  }

  private m_selectedNode: CompTreeNode | null = null

  /**
   * 選択ノードです。
   */
  get selectedNode(): CompTreeNode | undefined {
    return this.m_selectedNode ? this.m_selectedNode : undefined
  }

  set selectedNode(node: CompTreeNode | undefined) {
    const prevSelectedNode = this.selectedNode
    if (node) {
      if (prevSelectedNode && prevSelectedNode !== node) {
        prevSelectedNode.selected = false
      }
      node.selected = true
      this.m_selectedNode = node
    } else {
      if (prevSelectedNode) {
        prevSelectedNode.selected = false
      }
      this.m_selectedNode = null
    }
  }

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  /**
   * ツリービューが管理する全ノードのマップです。
   * key: ノードを特定するための値, value: ノード
   */
  private m_allNodes: { [key: string]: CompTreeNode } = {}

  /**
   * ツリービューの最小幅です。
   */
  private get m_minWidth(): number {
    let result = 0
    for (const child of this.children) {
      if (result < child.minWidth) {
        result = child.minWidth
      }
    }
    return result + treeViewUtils.getElementFrameWidth(this.m_childContainer)
  }

  //--------------------------------------------------
  //  Elements
  //--------------------------------------------------

  @NoCache
  get m_childContainer(): HTMLElement {
    return this.$refs.childContainer as HTMLElement
  }

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  /**
   * 指定されたノードデータからノードツリーを構築します。
   * @param nodeDataList ノードツリーを構築するためのデータ
   * @param insertIndex ノード挿入位置
   */
  buildTree(nodeDataList: NodeData[], insertIndex?: number): void {
    nodeDataList.forEach(nodeData => {
      this.m_addNodeByData(nodeData, { insertIndex })
      if (!(insertIndex === undefined || insertIndex === null)) {
        insertIndex++
      }
    })
  }

  /**
   * 子ノードを追加します。
   * @param child ノード、またはノードを構築するためのデータ
   * @param options
   * <ul>
   *   <li>parent: 親ノードを特定するための値。</li>
   *   <li>insertIndex: ノード挿入位置。sortFuncと同時に指定することはできない。</li>
   *   <li>sortFunc: ノードをソートする関数。insertIndexと同時に指定することはできない。</li>
   * </ul>
   */
  addChild(
    child: NodeData | CompTreeNode,
    options: { parent?: string; insertIndex?: number | null; sortFunc?: ChildrenSortFunc } = {}
  ): CompTreeNode {
    if (isInteger(options.insertIndex) && options.insertIndex! >= 0 && options.sortFunc) {
      throw new Error('You cannot specify both "insertIndex" and "sortFunc".')
    }

    let node: CompTreeNode
    const childType = child instanceof Vue ? 'Node' : 'Data'

    if (isString(options.parent)) {
      const parentNode = this.getNode(options.parent)
      if (!parentNode) {
        throw new Error(`The parent node "${options.parent}" does not exist.`)
      }
      node = parentNode.addChild(child, options)
    } else {
      // 引数のノードがノードコンポーネントで指定された場合
      if (childType === 'Node') {
        node = this.m_addNodeByNode(child as CompTreeNode, options)
      }
      // 引数のノードがノードデータで指定された場合
      else if (childType === 'Data') {
        node = this.m_addNodeByData(child as NodeData, options)
      }
    }

    return node!
  }

  /**
   * ノードを削除します。
   * @param value ノードを特定するための値
   */
  removeNode(value: string): CompTreeNode | undefined {
    const node = this.getNode(value)
    if (!node) return

    // 親がツリービューの場合
    // (node.parentが空の場合、親はツリービュー)
    if (!node.parent) {
      this.m_removeChildFromContainer(node)
      treeViewUtils.dispatchNodeRemoved(this, node)
    }
    // 親がノードの場合
    else {
      node.parent.removeChild(node)
    }

    return node
  }

  /**
   * ノードを特定するためのvalueと一致するノードを取得します。
   * @param value ノードを特定するための値
   */
  getNode(value: string): CompTreeNode | undefined {
    return this.m_allNodes[value]
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  private m_addNodeByData(nodeData: NodeData, options: { insertIndex?: number | null; sortFunc?: ChildrenSortFunc } = {}): CompTreeNode {
    if (this.getNode(nodeData.value)) {
      throw new Error(`The node "${nodeData.value}" already exists.`)
    }

    // ノードの作成
    const node = treeViewUtils.newNode(this, nodeData)

    // ノード挿入位置を決定
    const insertIndex = this.m_getInsertIndex(node, options)

    // コンテナにノードを追加
    this.m_insertChildIntoContainer(node, insertIndex)

    // 子ノードの設定
    const len = nodeData.children ? nodeData.children.length : 0
    for (let i = 0; i < len; i++) {
      node.addChild(nodeData.children![i], { insertIndex: i })
    }

    // ノードが追加されたことを通知するイベントを発火
    treeViewUtils.dispatchNodeAdded(node)

    return node
  }

  private m_addNodeByNode(node: CompTreeNode, options: { insertIndex?: number | null; sortFunc?: ChildrenSortFunc } = {}): CompTreeNode {
    // 一旦親からノードを削除
    if (node.parent) {
      node.parent.removeChild(node)
    } else {
      // 親がない場合、ツリービューが親
      node.treeView.removeNode(node.value)
    }

    // ノード挿入位置を決定
    const insertIndex = this.m_getInsertIndex(node, options)

    // コンテナにノードを追加
    this.m_insertChildIntoContainer(node, insertIndex)

    // 子ノードの設定
    for (let i = 0; i < node.children.length; i++) {
      const childNode = node.children[i]
      node.addChild(childNode, { insertIndex: i })
    }

    // ノードが追加されたことを通知するイベントを発火
    treeViewUtils.dispatchNodeAdded(node)

    return node
  }

  private m_getInsertIndex(newNode: CompTreeNode, options: { insertIndex?: number | null; sortFunc?: ChildrenSortFunc } = {}): number {
    if (isInteger(options.insertIndex)) {
      return options.insertIndex!
    } else if (isFunction(options.sortFunc)) {
      const children = [...this.children, newNode]
      children.sort(options.sortFunc!)
      const index = children.indexOf(newNode)
      return index === -1 ? this.children.length : index
    } else {
      return this.m_children.length
    }
  }

  /**
   * ノードが発火する標準のイベントとは別に、独自イベント用のリスナを登録します。
   * @param eventName
   */
  m_addExtraNodeEventListener(eventName: string): void {
    this.m_childContainer.removeEventListener(eventName, this.m_allNodesOnExtraNodeEvent)
    this.m_childContainer.addEventListener(eventName, this.m_allNodesOnExtraNodeEvent)
  }

  /**
   * コンテナへノードを挿入します。
   * @param node 追加するノード
   * @param insertIndex ノード挿入位置
   */
  private m_insertChildIntoContainer(node: CompTreeNode, insertIndex: number): void {
    const childrenLength = this.m_childContainer.children.length

    // 挿入位置が大きすぎないかを検証
    if (childrenLength < insertIndex) {
      throw new Error('insertIndex is too big.')
    }

    // コンテナにノードを追加
    if (childrenLength === insertIndex) {
      this.m_childContainer.appendChild(node.$el)
    } else {
      const afterNode = this.m_childContainer.children[insertIndex]
      this.m_childContainer.insertBefore(node.$el, afterNode)
    }

    this.m_children.splice(insertIndex, 0, node)

    // 最年長ノードフラグを再設定
    this.m_restIsEldest()
  }

  /**
   * コンテナからノードを削除します。
   * @node 削除するノード
   */
  private m_removeChildFromContainer(node: CompTreeNode): void {
    this.m_childContainer.removeChild(node.$el)

    const index = this.m_children.indexOf(node)
    if (index >= 0) {
      this.m_children.splice(index, 1)
    }

    // 最年長ノードフラグを再設定
    this.m_restIsEldest()
  }

  /**
   * 最年長ノードフラグを再設定します。
   */
  private m_restIsEldest(): void {
    this.m_children.forEach((item, index) => {
      item.isEldest = index === 0
    })
  }

  //----------------------------------------------------------------------
  //
  //  Event listeners
  //
  //----------------------------------------------------------------------

  /**
   * ツリービューにノードが追加された際のリスナです。
   * @param e
   */
  private m_nodeAdded(e) {
    e.stopImmediatePropagation()

    const node = e.target.__vue__ as CompTreeNode
    this.m_allNodes[node.value] = node

    // ノードが発火する独自イベントの設定
    for (const eventName of node.extraEventNames) {
      this.m_addExtraNodeEventListener(eventName)
    }

    if (node.selected) {
      this.selectedNode = node
    }
  }

  /**
   * ツリービューからノードが削除される直前のリスナです。
   * @param e
   */
  private m_nodeBeforeRemoved(e) {
    e.stopImmediatePropagation()

    const node = e.detail.node as CompTreeNode

    if (this.selectedNode === node) {
      this.selectedNode = undefined
    }
  }

  /**
   * ツリービューからノードが削除された際のリスナです。
   * @param e
   */
  private m_nodeRemoved(e) {
    e.stopImmediatePropagation()

    const node = e.detail.node as CompTreeNode
    for (const descendant of treeViewUtils.getDescendants(node)) {
      delete this.m_allNodes[descendant.value]
    }
    delete this.m_allNodes[node.value]
  }

  /**
   * ノードでnode-property-changedイベントが発火した際のリスナです。
   * @param e
   */
  private m_allNodesOnNodePropertyChanged(e) {
    e.stopImmediatePropagation()

    const node = e.target.__vue__ as CompTreeNode
    const detail = e.detail as NodePropertyChangeDetail

    if (detail.property === 'value') {
      delete this.m_allNodes[detail.oldValue]
      this.m_allNodes[detail.newValue] = node
    }
  }

  /**
   * ノードでopened-changedイベントが発火した際のリスナです。
   * @param e
   */
  private m_allNodesOnOpenedChanged(e) {
    e.stopImmediatePropagation()

    const node = e.target.__vue__ as CompTreeNode
    this.$emit('opened-changed', node)
  }

  /**
   * ノードでselected-changedイベントが発火した際のリスナです。
   * @param e
   */
  private m_allNodesOnSelectedChanged(e) {
    e.stopImmediatePropagation()

    const node = e.target.__vue__ as CompTreeNode

    // ノードが選択された場合
    if (node.selected) {
      this.selectedNode = node
      this.$emit('selected', node)
    }
    // ノードの選択が解除された場合
    else {
      if (this.selectedNode === node) {
        this.selectedNode = undefined
      }
      this.$emit('unselected', node)
    }
  }

  /**
   * ノードが発火する標準のイベントとは別に、独自イベントが発火した際のリスナです。
   * @param e
   */
  private m_allNodesOnExtraNodeEvent(e) {
    e.stopImmediatePropagation()

    const node = e.target.__vue__ as CompTreeNode
    this.$emit(e.type, node)
  }
}
</script>
