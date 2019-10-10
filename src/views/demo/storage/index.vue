<style lang="stylus" scoped>
@import '../../../styles/app.variables.styl'

.container {
  height: 100%
}

.splitter {
  height: 100%
}

.tree-view-container {
  width: 100%
  height: 100%
}

.tree-view {
  height: 100%
  /*--comp-tree-view-font-size: 26px*/
  /*--comp-tree-node-indent: 20px*/
  --comp-tree-node-distance: 10px
}
</style>

<template>
  <div class="container">
    <q-splitter v-model="m_splitterModel" class="splitter">
      <template v-slot:before>
        <div class="tree-view-container">
          <comp-tree-view
            ref="treeView"
            class="tree-view"
            @create-dir-selected="m_treeViewOnCreateDirSelected($event)"
            @files-upload-selected="m_treeViewOnFilesUploadSelected($event)"
            @dir-upload-selected="m_treeViewOnDirUploadSelected($event)"
            @delete-selected="m_treeViewOnDeleteSelected($event)"
          />
        </div>
      </template>
      <template v-slot:after>
        <div class="app-ma-20">
          <div class="layout horizontal center">
            <q-input v-model="m_filePath" class="flex" label="File URL" />
            <q-btn label="Load" color="primary" class="app-ml-10" @click="m_loadFileButtonOnClick()" />
            <q-btn label="Refresh" color="primary" icon="storage" class="app-ml-10" @click="m_refreshStorageButtonOnClick()" />
          </div>
          <img ref="img" class="app-mt-20" />
        </div>
      </template>
    </q-splitter>
    <storage-dir-create-dialog ref="dirCreateDialog" />
    <storage-nodes-remove-dialog ref="nodesRemoveDialog" />
    <storage-upload-progress ref="uploadProgress" class="fixed-bottom-right" />
  </div>
</template>

<script lang="ts">
import { BaseComponent, NoCache, ResizableMixin } from '@/components'
import { StorageNode, StorageNodeBag, StorageNodeType } from '@/logic'
import StorageTreeNodeItem, { StorageTreeNodeData } from '@/views/demo/storage/storage-tree-node-item.vue'
import CompTreeNode from '@/components/comp-tree-view/comp-tree-node.vue'
import CompTreeNodeItem from '@/components/comp-tree-view/comp-tree-node-item.vue'
import CompTreeView from '@/components/comp-tree-view/index.vue'
import { Component } from 'vue-property-decorator'
import StorageDirCreateDialog from '@/views/demo/storage/storage-dir-create-dialog.vue'
import StorageNodesRemoveDialog from '@/views/demo/storage/storage-nodes-remove-dialog.vue'
import StorageUploadProgress from '@/views/demo/storage/storage-upload-progress.vue'
import axios from 'axios'
import { mixins } from 'vue-class-component'

@Component({
  name: 'demo-storage-page',
  components: { CompTreeView, CompTreeNode, CompTreeNodeItem, StorageDirCreateDialog, StorageNodesRemoveDialog, StorageUploadProgress },
})
export default class DemoStoragePage extends mixins(BaseComponent, ResizableMixin) {
  //----------------------------------------------------------------------
  //
  //  Lifecycle hooks
  //
  //----------------------------------------------------------------------

  async mounted() {
    this.m_storageNode = this.m_treeView.addChild({
      value: '',
      label: 'Storage',
      icon: 'storage',
      opened: true,
      nodeType: 'Storage',
      itemClass: StorageTreeNodeItem,
    } as StorageTreeNodeData)
  }

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  private m_splitterModel = 30

  private m_storageNode: CompTreeNode = {} as any

  private m_filePath: string = ''

  //--------------------------------------------------
  //  Elements
  //--------------------------------------------------

  @NoCache
  get m_treeView(): CompTreeView {
    return this.$refs.treeView as CompTreeView
  }

  @NoCache
  private get m_uploadFileInput(): HTMLInputElement {
    return this.$refs.uploadFileInput as HTMLInputElement
  }

  @NoCache
  private get m_dirCreateDialog(): StorageDirCreateDialog {
    return this.$refs.dirCreateDialog as StorageDirCreateDialog
  }

  @NoCache
  private get m_nodesRemoveDialog(): StorageNodesRemoveDialog {
    return this.$refs.nodesRemoveDialog as StorageNodesRemoveDialog
  }

  @NoCache
  private get m_uploadProgress(): StorageUploadProgress {
    return this.$refs.uploadProgress as StorageUploadProgress
  }

  @NoCache
  get m_img(): HTMLImageElement {
    return this.$refs.img as HTMLImageElement
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  private async m_getStorageNodes(): Promise<void> {
    const bag = await this.$logic.storage.getUserNodes()
    this.m_buildStorageTree(bag)
  }

  private async m_buildStorageTree(bag: StorageNodeBag): Promise<void> {
    const sortFunc = (a: CompTreeNode<StorageTreeNodeItem>, b: CompTreeNode<StorageTreeNodeItem>) => {
      if (a.item.nodeType === StorageNodeType.Dir && b.item.nodeType === StorageNodeType.File) {
        return -1
      } else if (a.item.nodeType === StorageNodeType.File && b.item.nodeType === StorageNodeType.Dir) {
        return 1
      }
      if (a.label < b.label) {
        return -1
      } else if (a.label > b.label) {
        return 1
      } else {
        return 0
      }
    }

    for (const item of bag.list) {
      const nodeData = this.m_toStorageNodeData(item)
      const node = this.m_treeView.getNode(nodeData.value)
      if (node) {
        delete nodeData.selected
        delete nodeData.opened
        node.setEditData(nodeData)
        this.m_treeView.addChild(node, {
          parent: item.dir || this.m_storageNode.value,
          sortFunc,
        })
      } else {
        this.m_treeView.addChild(nodeData, {
          parent: item.dir || this.m_storageNode.value,
          sortFunc,
        })
      }
    }
  }

  private m_toStorageNodeData(data: StorageNode): StorageTreeNodeData {
    return {
      label: data.name,
      value: data.path,
      icon: data.nodeType === StorageNodeType.Dir ? 'folder' : 'description',
      opened: false,
      nodeType: data.nodeType,
      itemClass: StorageTreeNodeItem,
    }
  }

  private async m_getDirectoryList(dirPath: string) {
    const dirRef = firebase.storage().ref(dirPath)
    const listRef = dirRef.child('files/uid')
  }

  private async m_createDir(dirPath: string): Promise<void> {
    this.$q.loading.show()
    let bag: StorageNodeBag
    try {
      bag = await this.$logic.storage.createUserStorageDirs([dirPath])
    } catch (err) {
      this.$q.loading.hide()
      console.error(err)
      this.$q.notify({
        icon: 'report',
        position: 'bottom-left',
        message: String(this.$t('storage.creationFolderFailed')),
        timeout: 0,
        actions: [{ icon: 'close', color: 'white' }],
      })
      return
    }
    this.m_buildStorageTree(bag)
    this.$q.loading.hide()
  }

  private async m_removeNode(node: CompTreeNode<StorageTreeNodeItem>): Promise<void> {
    this.$q.loading.show()
    let bag: StorageNodeBag
    try {
      if (node.item.nodeType === StorageNodeType.File) {
        bag = await this.$logic.storage.removeUserStorageFiles([node.value])
      } else if (node.item.nodeType === StorageNodeType.Dir) {
        bag = await this.$logic.storage.removeUserStorageDir(node.value)
      }
    } catch (err) {
      this.$q.loading.hide()
      console.error(err)
      this.$q.notify({
        icon: 'report',
        position: 'bottom-left',
        message: String(this.$t('storage.deletionItemsFailed')),
        timeout: 0,
        actions: [{ icon: 'close', color: 'white' }],
      })
      return
    }
    for (const node of bag.list) {
      this.m_treeView.removeNode(node.path)
    }
    this.$q.loading.hide()
  }

  //----------------------------------------------------------------------
  //
  //  Event listeners
  //
  //----------------------------------------------------------------------

  private async m_refreshStorageButtonOnClick() {
    await this.m_getStorageNodes()
  }

  private async m_loadFileButtonOnClick(e) {
    this.m_img.src = this.m_filePath

    /*
    // 画像パス(例: images/space.png)から参照を取得
    const ref = firebase.storage().ref(this.m_filePath)
    // 取得した参照からダウンロード用のURLを取得し、URLの画像を表示
    const downloadURL = await ref.getDownloadURL()

    // ファイルのメタデータを取得
    const metadata = await ref.getMetadata()
    console.log(metadata)

    // ファイルのコンテンツを取得
    const response = await axios.request({
      url: downloadURL,
      method: 'get',
      // responseType: 'blob',
      responseType: 'text',
    })
    console.log(response)
    */
  }

  private async m_treeViewOnFilesUploadSelected(dirNode: CompTreeNode<StorageTreeNodeItem>) {
    this.m_uploadProgress.openFilesSelectDialog(dirNode.value)
  }

  private async m_treeViewOnDirUploadSelected(dirNode: CompTreeNode<StorageTreeNodeItem>) {
    this.m_uploadProgress.openDirSelectDialog(dirNode.value)
  }

  private async m_treeViewOnCreateDirSelected(node: CompTreeNode<StorageTreeNodeItem>) {
    const dirPath = await this.m_dirCreateDialog.open(node)
    if (dirPath) {
      await this.m_createDir(dirPath)
    }
  }

  private async m_treeViewOnDeleteSelected(node: CompTreeNode<StorageTreeNodeItem>) {
    const confirmed = await this.m_nodesRemoveDialog.open([node])
    if (confirmed) {
      await this.m_removeNode(node)
    }
  }
}
</script>
