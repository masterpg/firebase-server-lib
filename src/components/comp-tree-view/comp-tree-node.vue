<style lang="stylus" scoped>
@import '../../styles/app.variables.styl'

.main {
}

.item-container {
  padding-top: var(--comp-tree-distance, 6px)

  &.eldest {
    padding-top: 0
  }

  .icon-container {
    @extend $layout-horizontal
    @extend $layout-center-center
    min-width: 1.5em
    max-width: 1.5em
    height: 1.5em
    margin-right: 6px
  }

  .toggle-icon {
    transition: transform .5s
    cursor: pointer
  }
}

.child-container {
  padding-left: var(--comp-tree-indent, 16px)
  height: 0
  overflow: hidden
}
</style>

<template>
  <div class="main">
    <div
      ref="itemContainer"
      class="item-container layout horizontal center"
      :class="{ eldest: isEldest }"
      @selected-changed="m_itemOnSelectedChanged"
      @node-property-changed="m_itemOnNodePropertyChanged"
    >
      <!-- トグルアイコン有り -->
      <div v-if="m_hasChildren" class="icon-container">
        <q-icon name="arrow_right" size="26px" color="grey-6" class="toggle-icon" :class="[opened ? 'rotate-90' : '']" @click="m_toggleIconOnClick" />
      </div>
      <!-- トグルアイコン無し -->
      <div v-else class="icon-container">
        <q-icon name="" size="26px" />
      </div>

      <!-- 指定アイコン -->
      <div v-if="!!icon" class="icon-container">
        <q-icon :name="icon" :color="iconColor" size="24px" />
      </div>
      <!-- ドットアイコン -->
      <div v-else class="icon-container">
        <svg class="dot" width="6px" height="6px" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
          <circle cx="3" cy="3" r="3" fill="#9b9b9b" stroke-width="0" />
        </svg>
      </div>
    </div>
    <div ref="childContainer" class="child-container" :class="{ opened: opened }"></div>
  </div>
</template>

<script lang="ts">
import * as treeViewUtils from '@/components/comp-tree-view/comp-tree-view-utils'
import { BaseComponent, NoCache } from '@/components'
import { ChildrenSortFunc, CompTreeNodeData, CompTreeNodeEditData } from '@/components/comp-tree-view/types'
import CompTreeNodeItem from '@/components/comp-tree-view/comp-tree-node-item.vue'
import CompTreeView from '@/components/comp-tree-view/index.vue'
import { Component } from 'vue-property-decorator'
import { NodePropertyChangeDetail } from '@/components/comp-tree-view/comp-tree-view-utils'
import Vue from 'vue'
const isInteger = require('lodash/isInteger')
const isFunction = require('lodash/isFunction')
const isBoolean = require('lodash/isBoolean')
const isString = require('lodash/isString')

@Component({ name: 'comp-tree-node' })
export default class CompTreeNode<NodeItem extends CompTreeNodeItem = any> extends BaseComponent {
  //----------------------------------------------------------------------
  //
  //  Lifecycle hooks
  //
  //----------------------------------------------------------------------

  mounted() {
    this.item.$mount()
    this.m_itemContainer.appendChild(this.item.$el)

    for (const eventName of this.item.extraEventNames) {
      this.m_itemContainer.addEventListener(eventName, this.m_itemOnExtraEvent)
    }

    // this.m_childContainerObserver = new MutationObserver(records => {
    //   console.log(records)
    // })
    // this.m_childContainerObserver.observe(this.m_childContainer, { childList: true })
  }

  //----------------------------------------------------------------------
  //
  //  Properties
  //
  //----------------------------------------------------------------------

  private m_treeView: CompTreeView | null = null

  get treeView(): CompTreeView {
    return this.m_treeView!
  }

  private m_item: NodeItem | null = null

  get item(): NodeItem {
    return this.m_item!
  }

  /**
   * 自身が最年長のノードかを示すフラグです。
   */
  isEldest: boolean = false

  /**
   * アイコン名です。
   * https://material.io/tools/icons/?style=baseline
   */
  icon: string = ''

  /**
   * アイコンの色を指定します。
   * 例: primary, indigo-8
   */
  iconColor: string = ''

  private m_opened: boolean = false

  /**
   * アイテムの開閉です。
   */
  get opened(): boolean {
    return this.m_opened
  }

  /**
   * ラベルです。
   */
  get label(): string {
    return this.item.label
  }

  set label(value: string) {
    this.item.label = value
  }

  /**
   * ノードを特定するための値です。
   */
  get value(): string {
    return this.item.value
  }

  set value(value: string) {
    this.item.value = value
  }

  /**
   * 選択不可フラグです。
   * true: 選択不可, false: 選択可
   */
  get unselectable(): boolean {
    return this.item.unselectable
  }

  /**
   * 選択されているか否かです。
   */
  get selected(): boolean {
    return this.item.selected
  }

  set selected(value: boolean) {
    this.item.selected = value
  }

  private m_parent?: CompTreeNode | null = null

  /**
   * 親ノードです。
   */
  get parent(): CompTreeNode | undefined {
    return this.m_parent === null ? undefined : this.m_parent
  }

  private m_children: CompTreeNode[] = []

  /**
   * 子ノードです。
   */
  get children(): CompTreeNode[] {
    return this.m_children
  }

  /**
   * 標準で発火するイベントとは別に、追加で発火するイベント名のリストです。
   */
  get extraEventNames(): string[] {
    return this.item.extraEventNames
  }

  private m_minWidth: number = 0

  /**
   * ノードの最小幅です。
   */
  get minWidth(): number {
    this.m_setMinWidth()
    return this.m_minWidth
  }

  private m_setMinWidth(): void {
    // ノードアイテム部分の幅を取得
    let itemContainerWidth = 0
    for (const el of Array.from(this.m_itemContainer.children)) {
      itemContainerWidth += treeViewUtils.getElementWidth(el)
    }
    itemContainerWidth += treeViewUtils.getElementFrameWidth(this.m_itemContainer)

    // 子ノードの中で最大幅のものを取得
    let childContainerWidth = 0
    if (this.opened) {
      for (const child of this.children) {
        if (childContainerWidth < child.minWidth) {
          childContainerWidth = child.minWidth
          childContainerWidth += treeViewUtils.getElementFrameWidth(this.m_childContainer)
        }
      }
    }

    // 上記で取得したノードアイテム幅と子ノード幅を比較し、大きい方を採用する
    this.m_minWidth = itemContainerWidth >= childContainerWidth ? itemContainerWidth : childContainerWidth
  }

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  private m_childContainerObserver!: MutationObserver

  get m_hasChildren() {
    return this.children.length > 0
  }

  //--------------------------------------------------
  //  Elements
  //--------------------------------------------------

  @NoCache
  get m_itemContainer(): HTMLElement {
    return this.$refs.itemContainer as HTMLElement
  }

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
   * ノードの初期化を行います。
   * @param treeView
   * @param nodeData
   */
  init(treeView: CompTreeView, nodeData: CompTreeNodeData): void {
    this.m_treeView = treeView

    const NodeItemClass = Vue.extend(nodeData.itemClass || CompTreeNodeItem)
    const item = new NodeItemClass() as NodeItem
    item.init(nodeData)

    this.m_item = item
    this.m_opened = Boolean(nodeData.opened)
    this.icon = nodeData.icon || ''
    this.iconColor = nodeData.iconColor || ''
  }

  /**
   * 子ノードを追加します。
   * @param child ノード、またはノードを構築するためのデータ
   * @param options
   * <ul>
   *   <li>insertIndex: ノード挿入位置。sortFuncと同時に指定することはできない。</li>
   *   <li>sortFunc: ノードをソートする関数。insertIndexと同時に指定することはできない。</li>
   * </ul>
   */
  addChild(child: CompTreeNodeData | CompTreeNode, options: { insertIndex?: number | null; sortFunc?: ChildrenSortFunc } = {}): CompTreeNode {
    if (isInteger(options.insertIndex) && options.insertIndex! >= 0 && options.sortFunc) {
      throw new Error('You cannot specify both "insertIndex" and "sortFunc".')
    }

    let childNode: CompTreeNode
    const childType = child instanceof Vue ? 'Node' : 'Data'

    // 引数のノードがノードコンポーネントで指定された場合
    if (childType === 'Node') {
      childNode = this.m_addChildByNode(child as CompTreeNode, options)
    }
    // 引数のノードがノードデータで指定された場合
    else if (childType === 'Data') {
      childNode = this.m_addChildByData(child as CompTreeNodeData, options)
    }

    return childNode!
  }

  /**
   * 子ノードを削除します。
   * @param childNode
   */
  removeChild(childNode: CompTreeNode): void {
    this.m_removeChild(childNode, true)
  }

  /**
   * 子ノードの開閉をトグルします。
   * @param animated
   */
  toggle(animated: boolean = true): void {
    this.m_toggle(!this.m_opened, animated)
  }

  /**
   * 子ノードを展開します。
   * @param animated
   */
  open(animated: boolean = true): void {
    this.m_toggle(true, animated)
  }

  /**
   * 子ノードを閉じます。
   * @param animated
   */
  close(animated: boolean = true): void {
    this.m_toggle(false, animated)
  }

  /**
   * ルートノードを取得します。
   */
  getRootNode(): CompTreeNode {
    if (this.parent) {
      return this.parent.getRootNode()
    }
    return this
  }

  /**
   * ノードを編集するためのデータを設定します。
   * @param editData
   */
  setEditData(editData: CompTreeNodeEditData): void {
    this.item.setEditData(editData)
    if (isString(editData.icon)) {
      this.icon = editData.icon!
    }
    if (isString(editData.iconColor)) {
      this.iconColor = editData.iconColor!
    }
    if (isBoolean(editData.opened)) {
      if (editData.opened!) {
        this.open(false)
      } else {
        this.close(false)
      }
    }
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  private m_addChildByData(
    childNodeData: CompTreeNodeData,
    options: { insertIndex?: number | null; sortFunc?: ChildrenSortFunc } = {}
  ): CompTreeNode {
    if (this.treeView.getNode(childNodeData.value)) {
      throw new Error(`The node "${childNodeData.value}" already exists.`)
    }

    // 子ノードの作成
    const childNode = treeViewUtils.newNode(this.treeView, childNodeData)

    // ノード挿入位置を決定
    const insertIndex = this.m_getInsertIndex(childNode, options)

    // コンテナにノードを追加
    this.m_insertChildIntoContainer(childNode, insertIndex)

    // コンテナの高さを設定
    if (this.opened) {
      const childrenContainerHeight = this.m_getChildrenContainerHeight(this)
      const childNodeHeight = childrenContainerHeight + childNode.$el.getBoundingClientRect().height
      this.m_childContainer.style.height = `${childNodeHeight}px`
    }

    // ノードの親子関係を設定
    childNode.m_parent = this
    this.children.splice(insertIndex, 0, childNode)

    // 親ノードのコンテナの高さを設定
    if (this.parent) {
      this.parent.m_refreshChildrenContainerHeight(false)
    }

    // 子ノードの設定
    const len = childNodeData.children ? childNodeData.children.length : 0
    for (let i = 0; i < len; i++) {
      childNode.addChild(childNodeData.children![i], { insertIndex: i })
    }

    // ノードが追加されたことを通知するイベントを発火
    treeViewUtils.dispatchNodeAdded(childNode)

    return childNode
  }

  private m_addChildByNode(childNode: CompTreeNode, options: { insertIndex?: number | null; sortFunc?: ChildrenSortFunc } = {}): CompTreeNode {
    // 追加しようとするノードの子に自ノードが含まれないことを検証
    const descendantMap = treeViewUtils.getDescendantMap(childNode)
    if (descendantMap[this.value]) {
      throw new Error(`The specified node "${childNode.value}" contains the new parent "${this.value}".`)
    }

    // 一旦親から子ノードを削除
    if (childNode.parent) {
      childNode.parent.m_removeChild(childNode, false)
    } else {
      // 親がない場合、ツリービューが親
      childNode.treeView.removeNode(childNode.value)
    }

    // ノード挿入位置を決定
    const insertIndex = this.m_getInsertIndex(childNode, options)

    // コンテナにノードを追加
    this.m_insertChildIntoContainer(childNode, insertIndex)

    // コンテナの高さを設定
    if (this.opened) {
      const childrenContainerHeight = this.m_getChildrenContainerHeight(this)
      const childNodeHeight = childrenContainerHeight + childNode.$el.getBoundingClientRect().height
      this.m_childContainer.style.height = `${childNodeHeight}px`
    }

    // ノードの親子関係を設定
    childNode.m_parent = this
    this.children.splice(insertIndex, 0, childNode)

    // 親ノードのコンテナの高さを設定
    if (this.parent) {
      this.parent.m_refreshChildrenContainerHeight(false)
    }

    // 子ノードの設定
    for (let i = 0; i < childNode.children.length; i++) {
      const descendant = childNode.children[i]
      childNode.addChild(descendant, { insertIndex: i })
    }

    // ノードが追加されたことを通知するイベントを発火
    treeViewUtils.dispatchNodeAdded(childNode)

    return childNode
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
      return this.children.length
    }
  }

  private m_toggle(opened: boolean, animated: boolean = true): void {
    this.m_opened = opened
    this.m_refreshChildrenContainerHeight(animated)

    this.$el.dispatchEvent(
      new CustomEvent('opened-changed', {
        bubbles: true,
        cancelable: true,
        composed: true,
      })
    )
  }

  /**
   * 子ノードが配置されるコンテナの高さを再計算し、高さをリフレッシュします。
   * @param animated
   */
  private m_refreshChildrenContainerHeight(animated: boolean): Promise<void> {
    const DURATION = 500
    const duration = animated ? DURATION : 0

    return new Promise<void>(resolve => {
      this.m_childContainer.style.transition = animated ? `height ${duration / 1000}s` : ''

      const newHeight = this.m_getChildrenContainerHeight(this)
      this.m_childContainer.style.height = `${newHeight}px`

      if (this.parent) {
        this.parent.m_refreshChildrenContainerHeight(animated)
      }

      setTimeout(resolve, duration)
    })
  }

  /**
   * 子ノードが配置されるコンテナの高さを算出します。
   * @param base 基準となるノードを指定します。このノードの子孫を走査して高さが算出されるます。
   */
  private m_getChildrenContainerHeight(base: CompTreeNode): number {
    let result = 0

    if (this.opened) {
      result += treeViewUtils.getElementFrameHeight(this.m_childContainer)
      for (let child of this.children) {
        result += child.m_getChildrenContainerHeight(base)
      }
    }

    // 基準ノードの高さは排除したいためのif文
    if (this !== base) {
      result += this.m_itemContainer.getBoundingClientRect().height
    }

    return result
  }

  /**
   * 子コンテナへノードを挿入します。
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
  }

  /**
   * 子ノードを削除します。
   * @param childNode
   * @param isDispatchEvent 削除イベントを発火するか否かを指定
   * @return 削除された場合はtrue, 削除対象のノードがなく削除が行われなかった場合はfalse
   */
  private m_removeChild(childNode: CompTreeNode, isDispatchEvent: boolean): boolean {
    const index = this.children.indexOf(childNode)
    if (index >= 0) {
      isDispatchEvent && treeViewUtils.dispatchNodeBeforeRemoved(this, childNode)
      childNode.m_parent = null
      this.m_children.splice(index, 1)
      this.m_removeChildFromContainer(childNode)
      this.m_refreshChildrenContainerHeight(false)
      isDispatchEvent && treeViewUtils.dispatchNodeRemoved(this, childNode)
      return true
    }
    return false
  }

  /**
   * 子コンテナからノードを削除します。
   * @param node
   */
  private m_removeChildFromContainer(node: CompTreeNode): void {
    this.m_childContainer.removeChild(node.$el)
  }

  //----------------------------------------------------------------------
  //
  //  Event listeners
  //
  //----------------------------------------------------------------------

  /**
   * トグルアイコンのクリック時のリスナです。
   */
  private m_toggleIconOnClick() {
    this.toggle()
  }

  /**
   * ノードアイテムが選択された際のリスナです。
   * @param e
   */
  private m_itemOnSelectedChanged(e) {
    e.stopImmediatePropagation()

    treeViewUtils.dispatchSelectedChanged(this)
  }

  /**
   * ノードのプロパティが変更された際のリスナです。
   * @param e
   */
  private m_itemOnNodePropertyChanged(e) {
    e.stopImmediatePropagation()

    const detail = e.detail as NodePropertyChangeDetail
    treeViewUtils.dispatchNodePropertyChanged(this, detail)

    if (detail.property === 'label') {
      this.$nextTick(() => {
        this.m_setMinWidth()
      })
    }
  }

  /**
   * ノードアイテムが発火する標準のイベントとは別に、独自イベントが発火した際のリスナです。
   * @param e
   */
  private m_itemOnExtraEvent(e) {
    e.stopImmediatePropagation()

    this.$el.dispatchEvent(
      new CustomEvent(e.type, {
        bubbles: true,
        cancelable: true,
        composed: true,
      })
    )
  }
}
</script>
