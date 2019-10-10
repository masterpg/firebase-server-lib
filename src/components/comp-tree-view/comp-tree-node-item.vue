<style lang="stylus" scoped>
@import '../../styles/app.variables.styl'

.item {
  cursor: pointer
  white-space: nowrap

  &:hover {
    text-decoration: underline
  }

  &.selected {
    color: var(--comp-tree-selected-color, $pink-5)
  }

  &.unselectable {
    color: var(--comp-tree-unselectable-color, $grey-9)
    cursor: default
    &:hover {
      text-decoration: none
    }
  }
}
</style>

<template>
  <span class="item" :class="{ selected, unselectable }" @click="itemOnClick()">{{ label }}</span>
</template>

<script lang="ts">
import * as treeViewUtils from '@/components/comp-tree-view/comp-tree-view-utils'
import { CompTreeNodeData, CompTreeNodeEditData } from '@/components/comp-tree-view/types'
import { BaseComponent } from '@/components'
import { Component } from 'vue-property-decorator'
const isBoolean = require('lodash/isBoolean')
const isString = require('lodash/isString')

@Component({ name: 'comp-tree-node-item' })
export default class CompTreeNodeItem<NodeData extends CompTreeNodeData = any> extends BaseComponent {
  //----------------------------------------------------------------------
  //
  //  Properties
  //
  //----------------------------------------------------------------------

  private m_label: string = ''

  /**
   * ラベルです。
   */
  get label(): string {
    return this.m_label
  }

  set label(value: string) {
    const oldValue = this.m_label
    this.m_label = value
    treeViewUtils.dispatchNodePropertyChanged(this, { property: 'label', newValue: value, oldValue })
  }

  private m_value: string = ''

  /**
   * ノードを特定するための値です。
   */
  get value(): string {
    return this.m_value
  }

  set value(value: string) {
    const oldValue = this.m_value
    this.m_value = value
    treeViewUtils.dispatchNodePropertyChanged(this, { property: 'value', newValue: value, oldValue })
  }

  private m_unselectable: boolean = false

  /**
   * 選択不可フラグです。
   */
  get unselectable(): boolean {
    return this.m_unselectable
  }

  set unselectable(value: boolean) {
    this.m_unselectable = value
    if (value) {
      this.selected = false
    }
  }

  private m_selected: boolean = false

  /**
   * 選択されているか否かです。
   */
  get selected(): boolean {
    return this.m_selected
  }

  set selected(value: boolean) {
    this.m_setSelected(value, false)
  }

  /**
   * ノードアイテムが発火する標準のイベントとは別に、独自で発火するイベント名のリストです。
   * CompTreeNodeItemを拡張し、そのノードアイテムで独自イベントを発火するよう実装した場合、
   * このプロパティをオーバーライドし、イベント名の配列を返すよう実装してください。
   */
  get extraEventNames(): string[] {
    return []
  }

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  init(nodeData: NodeData): void {
    this.m_label = nodeData.label
    this.m_value = nodeData.value
    this.m_unselectable = Boolean(nodeData.unselectable)
    this.m_setSelected(Boolean(nodeData.selected), true)

    this.initPlaceholder(nodeData)
  }

  /**
   * ノードを編集するためのデータを設定します。
   * @param editData
   */
  setEditData(editData: CompTreeNodeEditData): void {
    if (isString(editData.label)) {
      this.label = editData.label!
    }
    if (isString(editData.value)) {
      this.value = editData.value!
    }
    if (isBoolean(editData.unselectable)) {
      this.unselectable = editData.unselectable!
    }
    if (isBoolean(editData.selected)) {
      this.selected = editData.selected!
    }
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  /**
   * CompTreeNodeItemを拡張する際、初期化時に独自処理が必要な場合のプレースホルダーです。
   * 独自処理が必要な場合はこのメソッドをオーバーライドしてください。
   * @param nodeData
   */
  protected initPlaceholder(nodeData: NodeData): void {}

  /**
   * selectedの設定を行います。
   * @param value selectedの設定値を指定
   * @param initializing 初期化中か否かを指定
   */
  private m_setSelected(value: boolean, initializing: boolean): void {
    const changed = this.m_selected !== value
    // 選択不可の場合
    if (this.unselectable) {
      if (changed) {
        this.m_selected = false
        !initializing && treeViewUtils.dispatchSelectedChanged(this)
      }
    }
    // 選択可能な場合
    else {
      if (changed) {
        this.m_selected = value
        !initializing && treeViewUtils.dispatchSelectedChanged(this)
      }
    }
  }

  //----------------------------------------------------------------------
  //
  //  Event listeners
  //
  //----------------------------------------------------------------------

  protected itemOnClick(e) {
    this.selected = true
  }
}
</script>
