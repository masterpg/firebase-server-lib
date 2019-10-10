import CompTreeNode from '@/components/comp-tree-view/comp-tree-node.vue'
import CompTreeNodeItem from '@/components/comp-tree-view/comp-tree-node-item.vue'
import { Constructor } from '@/base/types'

export interface CompTreeNodeData {
  /**
   * ノードのラベルを指定します。
   */
  label: string
  /**
   * ノードがを特定するための値を指定します。
   */
  value: string
  /**
   * 非選択なノードか否かを指定します。
   * デフォルトは選択可能なので、非選択にしたい場合にtrueを設定します。
   */
  unselectable?: boolean
  /**
   * ノードが選択されているか否かを指定します。
   */
  selected?: boolean
  /**
   * ノードが開いているか否かを指定します。
   * デフォルトは閉じているので、開いた状態にしたい場合にtrueを設定します。
   */
  opened?: boolean
  /**
   * アイコン名を指定します。
   * https://material.io/tools/icons/?style=baseline
   */
  icon?: string
  /**
   * アイコンの色を指定します。
   * 例: primary, indigo-8
   */
  iconColor?: string
  /**
   * CompTreeNodeItemを拡張した場合、拡張したノードアイテムのクラスを指定します。
   */
  itemClass?: Constructor<CompTreeNodeItem>
  /**
   * 子ノードを指定します。
   */
  children?: this[]
}

export interface CompTreeNodeEditData extends Partial<Omit<CompTreeNodeData, 'itemClass' | 'children'>> {}

export type ChildrenSortFunc = (a: CompTreeNode, b: CompTreeNode) => number
