<style lang="stylus" scoped>
@import '../../../styles/app.variables.styl'

.container {
  &.pc, &.tab {
    width: 340px
  }
  &.sp {
    width: 270px
  }
}

.title {
  @extend $text-h6
}
</style>

<template>
  <q-dialog v-model="m_opened" @hide="m_dialogOnHide()">
    <q-card class="container" :class="{ pc: screenSize.pc, tab: screenSize.tab, sp: screenSize.sp }">
      <!-- タイトル -->
      <q-card-section>
        <div class="title">{{ $t('storage.deleteItems') }}</div>
      </q-card-section>

      <!-- コンテンツエリア -->
      <q-card-section>
        {{ m_message }}
      </q-card-section>

      <!-- ボタンエリア -->
      <q-card-section class="layout horizontal center end-justified">
        <!-- CANCELボタン -->
        <q-btn flat rounded color="primary" :label="$t('common.cancel')" @click="m_close(false)" />
        <!-- DELETEボタン -->
        <q-btn flat rounded color="primary" :label="$t('common.delete')" @click="m_close(true)" />
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { BaseComponent, ResizableMixin } from '@/components'
import { Component, Watch } from 'vue-property-decorator'
import CompTreeNode from '@/components/comp-tree-view/comp-tree-node.vue'
import { StorageNodeType } from '@/logic'
import StorageTreeNodeItem from '@/views/demo/storage/storage-tree-node-item.vue'
import { mixins } from 'vue-class-component'

@Component({
  name: 'storage-nodes-remove-dialog',
  components: {},
})
export default class StorageNodesRemoveDialog extends mixins(BaseComponent, ResizableMixin) {
  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  private m_opened: boolean = false

  @Watch('m_opened')
  private m_openedChanged(newValue: boolean, oldValue: boolean) {
    if (!newValue) {
      this.$emit('closed')
    }
  }

  private m_resultResolve!: (confirmed: boolean) => void

  private m_resultConfirmed: boolean = false

  private m_nodes: CompTreeNode<StorageTreeNodeItem>[] = []

  private get m_message(): string {
    if (this.m_nodes.length === 1) {
      return String(this.$t('storage.deleteItemQ', { name: this.m_nodes[0].label }))
    }

    let fileNum = 0
    let folderNum = 0
    for (const node of this.m_nodes) {
      if (node.item.nodeType === StorageNodeType.Dir) {
        folderNum++
      } else if (node.item.nodeType === StorageNodeType.File) {
        fileNum++
      }
    }

    if (fileNum > 0) {
      return String(this.$t('storage.deleteFilesQ', { fileNum }))
    } else if (folderNum > 0) {
      return String(this.$t('storage.deleteFoldersQ', { folderNum }))
    } else {
      return String(this.$t('storage.deleteFilesAndFoldersQ', { fileNum, folderNum }))
    }
  }

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  open(nodes: CompTreeNode<StorageTreeNodeItem>[]): Promise<boolean> {
    this.m_nodes = nodes
    this.m_opened = true
    return new Promise<boolean>(resolve => {
      this.m_resultResolve = resolve
    })
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  private m_close(confirmed: boolean): void {
    this.m_resultConfirmed = confirmed
    this.m_opened = false
  }

  //----------------------------------------------------------------------
  //
  //  Event listeners
  //
  //----------------------------------------------------------------------

  m_dialogOnHide() {
    this.m_resultResolve(this.m_resultConfirmed)
    this.m_resultConfirmed = false
  }
}
</script>
