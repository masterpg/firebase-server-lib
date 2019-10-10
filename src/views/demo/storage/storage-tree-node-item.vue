<style lang="stylus" scoped>
@import '../../../styles/app.variables.styl'

.container {
}

.item {
  cursor: pointer
  white-space: nowrap
  user-select: none

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
  <div class="layout horizontal center container">
    <span class="item" :class="{ selected, unselectable }" @click="itemOnClick()" @click.right="m_itemOnRightClick()">
      {{ label }}
      <q-menu touch-position context-menu>
        <!-- ストレージ用メニュー -->
        <q-list v-show="m_isStorage" dense style="min-width: 100px">
          <q-item v-close-popup clickable>
            <q-item-section @click="m_dispatchCreateDirSelected()">{{ $t('storage.createFolder') }}</q-item-section>
          </q-item>
          <q-item v-close-popup clickable>
            <q-item-section @click="m_dispatchFilesUploadSelected()">{{ $t('storage.uploadFiles') }}</q-item-section>
          </q-item>
          <q-item v-close-popup clickable>
            <q-item-section @click="m_dispatchDirUploadSelected()">{{ $t('storage.uploadFolder') }}</q-item-section>
          </q-item>
        </q-list>
        <!-- フォルダ用メニュー -->
        <q-list v-show="m_isDir" dense style="min-width: 100px">
          <q-item v-close-popup clickable>
            <q-item-section @click="m_dispatchCreateDirSelected()">{{ $t('storage.createFolder') }}</q-item-section>
          </q-item>
          <q-item v-close-popup clickable>
            <q-item-section @click="m_dispatchFilesUploadSelected()">{{ $t('storage.uploadFiles') }}</q-item-section>
          </q-item>
          <q-item v-close-popup clickable>
            <q-item-section @click="m_dispatchDirUploadSelected()">{{ $t('storage.uploadFolder') }}</q-item-section>
          </q-item>
          <q-item v-close-popup clickable>
            <q-item-section @click="m_dispatchDeleteSelected()">{{ $t('common.delete') }}</q-item-section>
          </q-item>
        </q-list>
        <!-- ファイル用メニュー -->
        <q-list v-show="m_isFile" dense style="min-width: 100px">
          <q-item v-close-popup clickable>
            <q-item-section @click="m_dispatchDeleteSelected()">{{ $t('common.delete') }}</q-item-section>
          </q-item>
        </q-list>
      </q-menu>
    </span>
  </div>
</template>

<script lang="ts">
import { CompTreeNodeData } from '@/components/comp-tree-view/types'
import CompTreeNodeItem from '@/components/comp-tree-view/comp-tree-node-item.vue'
import { Component } from 'vue-property-decorator'
import { StorageNodeType } from '@/logic'

export interface StorageTreeNodeData extends CompTreeNodeData {
  nodeType: StorageNodeType | 'Storage'
}

@Component({ name: 'storage-tree-node-item' })
export default class StorageTreeNodeItem extends CompTreeNodeItem<StorageTreeNodeData> {
  //----------------------------------------------------------------------
  //
  //  Overridden
  //
  //----------------------------------------------------------------------

  protected initPlaceholder(nodeData: StorageTreeNodeData): void {
    this.m_nodeType = nodeData.nodeType
  }

  get extraEventNames(): string[] {
    return ['create-dir-selected', 'files-upload-selected', 'dir-upload-selected', 'delete-selected']
  }

  //----------------------------------------------------------------------
  //
  //  Properties
  //
  //----------------------------------------------------------------------

  private m_nodeType: StorageNodeType | 'Storage' = StorageNodeType.Dir

  get nodeType(): StorageNodeType | 'Storage' {
    return this.m_nodeType
  }

  //----------------------------------------------------------------------
  //
  //  Properties
  //
  //----------------------------------------------------------------------

  private get m_isStorage(): boolean {
    return this.nodeType === 'Storage'
  }

  private get m_isDir(): boolean {
    return this.nodeType === StorageNodeType.Dir
  }

  private get m_isFile(): boolean {
    return this.nodeType === StorageNodeType.File
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  private m_dispatchEvent(name: string): void {
    this.$el.dispatchEvent(
      new CustomEvent(name, {
        bubbles: true,
        cancelable: true,
        composed: true,
      })
    )
  }

  private m_dispatchCreateDirSelected(): void {
    this.m_dispatchEvent('create-dir-selected')
  }

  private m_dispatchFilesUploadSelected(): void {
    this.m_dispatchEvent('files-upload-selected')
  }

  private m_dispatchDirUploadSelected(): void {
    this.m_dispatchEvent('dir-upload-selected')
  }

  private m_dispatchDeleteSelected(): void {
    this.m_dispatchEvent('delete-selected')
  }

  //----------------------------------------------------------------------
  //
  //  Event listeners
  //
  //----------------------------------------------------------------------

  private m_itemOnRightClick(e) {
    console.log('m_itemOnRightClick')
  }
}
</script>
