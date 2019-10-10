import CompTreeNode from '@/components/comp-tree-view/comp-tree-node.vue'
import { CompTreeNodeData } from '@/components/comp-tree-view/types'
import CompTreeNodeItem from '@/components/comp-tree-view/comp-tree-node-item.vue'
import CompTreeView from '@/components/comp-tree-view/index.vue'
import Vue from 'vue'

/**
 * ノードを作成します。
 * @param treeView
 * @param nodeData
 */
export function newNode(treeView: CompTreeView, nodeData: CompTreeNodeData): CompTreeNode {
  const NodeClass = Vue.extend(CompTreeNode)
  const node = new NodeClass() as any
  node.init(treeView, nodeData)
  node.$mount()
  return node
}

/**
 * 指定されたノードの子孫を配列で取得します。
 * @param node
 */
export function getDescendants(node: CompTreeNode): CompTreeNode[] {
  const getChildren = (node: CompTreeNode) => {
    const result: CompTreeNode[] = []
    for (const child of (node as any).children) {
      result.push(...getChildren(child))
      result.push(child)
    }
    return result
  }

  const result: CompTreeNode[] = []
  for (const child of (node as any).children) {
    result.push(...getChildren(child))
    result.push(child)
  }
  return result
}

/**
 * 指定されたノードの子孫をマップで取得します。
 * @param node
 */
export function getDescendantMap(node: CompTreeNode): { [value: string]: CompTreeNode } {
  const getChildren = (node: CompTreeNode, result: { [value: string]: CompTreeNode }) => {
    for (const child of (node as any).children) {
      result[child.value] = child
      getChildren(child, result)
    }
    return result
  }

  const result: { [value: string]: CompTreeNode } = {}
  for (const child of (node as any).children) {
    result[child.value] = child
    getChildren(child, result)
  }
  return result
}

/**
 * ノードが追加された旨を通知するイベントを発火します。
 * @param node
 */
export function dispatchNodeAdded(node: CompTreeNode): void {
  node.$el.dispatchEvent(
    new CustomEvent('node-added', {
      bubbles: true,
      cancelable: true,
      composed: true,
    })
  )
}

/**
 * ノードが削除される直前を通知するイベントを発火します。
 * @param parent
 * @param child
 */
export function dispatchNodeBeforeRemoved(parent: CompTreeView | CompTreeNode, child: CompTreeNode): void {
  parent.$el.dispatchEvent(
    new CustomEvent('node-before-removed', {
      bubbles: true,
      cancelable: true,
      composed: true,
      detail: { node: child },
    })
  )
}

/**
 * ノードが削除された旨を通知するイベントを発火します。
 * @param parent
 * @param child
 */
export function dispatchNodeRemoved(parent: CompTreeView | CompTreeNode, child: CompTreeNode): void {
  parent.$el.dispatchEvent(
    new CustomEvent('node-removed', {
      bubbles: true,
      cancelable: true,
      composed: true,
      detail: { node: child },
    })
  )
}

/**
 * ノードの選択が変更された旨を通知するイベントを発火します。
 * @param target
 */
export function dispatchSelectedChanged(target: CompTreeNode | CompTreeNodeItem): void {
  target.$el.dispatchEvent(
    new CustomEvent('selected-changed', {
      bubbles: true,
      cancelable: true,
      composed: true,
    })
  )
}

export interface NodePropertyChangeDetail {
  property: 'value' | 'label'
  oldValue: any
  newValue: any
}

/**
 * ノードのプロパティが変更された旨を通知するイベントを発火します。
 * @param target
 * @param detail
 */
export function dispatchNodePropertyChanged(target: CompTreeNode | CompTreeNodeItem, detail: NodePropertyChangeDetail): void {
  target.$el.dispatchEvent(
    new CustomEvent('node-property-changed', {
      bubbles: true,
      cancelable: true,
      composed: true,
      detail,
    })
  )
}

/**
 * 文字列を浮動小数点数へ変換します。
 * @param value
 */
export function toFloat(value?: string): number {
  const result = parseFloat(value || '0')
  return isNaN(result) ? 0 : result
}

/**
 * 指定されたスタイルの幅を取得します。
 * @param style
 */
export function getElementWidth(style: CSSStyleDeclaration): number

/**
 * 指定された要素の幅を取得します。
 * @param element
 */
export function getElementWidth(element: Element): number

export function getElementWidth(elementOrStyle: Element | CSSStyleDeclaration): number {
  if (!elementOrStyle) return 0
  let result = 0
  let style: CSSStyleDeclaration
  if (elementOrStyle instanceof Element) {
    style = getComputedStyle(elementOrStyle)
  } else {
    style = elementOrStyle as CSSStyleDeclaration
  }
  result += toFloat(style.getPropertyValue('width'))
  result += getElementFrameWidth(style)
  return result
}

/**
 * 指定されたスタイルの枠の幅を取得します。
 * @param style
 */
export function getElementFrameWidth(style: CSSStyleDeclaration): number

/**
 * 指定された要素の枠の幅を取得します。
 * @param element
 */
export function getElementFrameWidth(element: Element): number

export function getElementFrameWidth(elementOrStyle: Element | CSSStyleDeclaration): number {
  if (!elementOrStyle) return 0
  let result = 0
  let style: CSSStyleDeclaration
  if (elementOrStyle instanceof Element) {
    style = getComputedStyle(elementOrStyle)
  } else {
    style = elementOrStyle as CSSStyleDeclaration
  }
  result += toFloat(style.getPropertyValue('border-left-width'))
  result += toFloat(style.getPropertyValue('border-right-width'))
  result += toFloat(style.getPropertyValue('margin-left'))
  result += toFloat(style.getPropertyValue('margin-right'))
  result += toFloat(style.getPropertyValue('padding-left'))
  result += toFloat(style.getPropertyValue('padding-right'))
  return result
}

/**
 * 指定された要素の高さを取得します。
 * @param element
 */
export function getElementHeight(element: Element): number

/**
 * 指定されたスタイルの高さを取得します。
 * @param style
 */
export function getElementHeight(style: CSSStyleDeclaration): number

export function getElementHeight(elementOrStyle: Element | CSSStyleDeclaration): number {
  if (!elementOrStyle) return 0
  let result = 0
  let style: CSSStyleDeclaration
  if (elementOrStyle instanceof Element) {
    style = getComputedStyle(elementOrStyle)
  } else {
    style = elementOrStyle as CSSStyleDeclaration
  }
  result += toFloat(style.getPropertyValue('height'))
  result += getElementFrameHeight(style)
  return result
}

/**
 * 指定された要素の枠の高さを取得します。
 * @param element
 */
export function getElementFrameHeight(element: Element): number

/**
 * 指定されたスタイルの枠の高さを取得します。
 * @param style
 */
export function getElementFrameHeight(style: CSSStyleDeclaration): number

export function getElementFrameHeight(elementOrStyle: Element | CSSStyleDeclaration): number {
  if (!elementOrStyle) return 0
  let result = 0
  let style: CSSStyleDeclaration
  if (elementOrStyle instanceof Element) {
    style = getComputedStyle(elementOrStyle)
  } else {
    style = elementOrStyle as CSSStyleDeclaration
  }
  result += toFloat(style.getPropertyValue('border-left-height'))
  result += toFloat(style.getPropertyValue('border-right-height'))
  result += toFloat(style.getPropertyValue('margin-top'))
  result += toFloat(style.getPropertyValue('margin-bottom'))
  result += toFloat(style.getPropertyValue('padding-top'))
  result += toFloat(style.getPropertyValue('padding-bottom'))
  return result
}
