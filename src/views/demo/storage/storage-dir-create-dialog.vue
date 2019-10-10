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
  <q-dialog v-model="m_opened" @show="m_dialogOnShow()" @before-hide="m_dialogOnBeforeHide()" @hide="m_dialogOnHide">
    <q-card class="container" :class="{ pc: screenSize.pc, tab: screenSize.tab, sp: screenSize.sp }">
      <!-- タイトル -->
      <q-card-section>
        <div class="title">{{ $t('storage.createFolder') }}</div>
      </q-card-section>

      <!-- コンテンツエリア -->
      <q-card-section>
        <q-input
          ref="dirNameInput"
          v-model="m_inputDirName"
          class="app-pb-20"
          :label="m_parentPath"
          :rules="m_dirNameRules"
          @input="m_dirNameInputOnInput()"
        >
          <template v-slot:prepend>
            <q-icon name="folder" />
          </template>
        </q-input>
      </q-card-section>

      <!-- ボタンエリア -->
      <q-card-section class="layout horizontal center end-justified">
        <!-- CANCELボタン -->
        <q-btn flat rounded color="primary" :label="$t('common.cancel')" @click="m_close()" />
        <!-- CREATEボタン -->
        <q-btn flat rounded color="primary" :label="$t('common.create')" @click="m_create()" />
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { BaseComponent, NoCache, ResizableMixin } from '@/components'
import { Component, Prop, Watch } from 'vue-property-decorator'
import CompTreeNode from '@/components/comp-tree-view/comp-tree-node.vue'
import { QInput } from 'quasar'
import StorageTreeNodeItem from '@/views/demo/storage/storage-tree-node-item.vue'
import { mixins } from 'vue-class-component'
const isEmpty = require('lodash/isEmpty')

@Component({
  name: 'storage-dir-create-dialog',
  components: {},
})
export default class StorageDirCreateDialog extends mixins(BaseComponent, ResizableMixin) {
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

  private m_resultResolve!: (dirPath: string) => void

  private m_resultDirPath: string = ''

  private m_inputDirName: string = ''

  private m_dirNameRules = [val => !val.includes('/') || this.$t('storage.slashIsUnusable')]

  private m_dirNameIsRequired = val => !!val || this.$t('storage.folderNameIsRequired')

  private m_parentNode: CompTreeNode<StorageTreeNodeItem> = {} as any

  private get m_parentPath(): string {
    if (isEmpty(this.m_parentNode)) return ''

    const storageNode = this.m_parentNode.getRootNode()
    if (storageNode === this.m_parentNode) {
      return `${this.m_parentNode.label}/`
    } else {
      return `${storageNode.label}/${this.m_parentNode.value}/`
    }
  }

  //--------------------------------------------------
  //  Elements
  //--------------------------------------------------

  @NoCache
  private get m_dirNameInput(): QInput {
    return this.$refs.dirNameInput as any
  }

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  open(parentNode: CompTreeNode<StorageTreeNodeItem>): Promise<string> {
    this.m_parentNode = parentNode
    this.m_opened = true
    return new Promise<string>(resolve => {
      this.m_resultResolve = resolve
    })
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  private m_close(dirPath?: string): void {
    this.m_resultDirPath = dirPath || ''
    this.m_opened = false
  }

  private async m_create(): Promise<void> {
    this.m_addDirNameIsRequired()
    if (this.m_dirNameInput.hasError) return

    let dirPath = ''
    const storageNode = this.m_parentNode.getRootNode()
    if (storageNode === this.m_parentNode) {
      dirPath = `${this.m_inputDirName}/`
    } else {
      dirPath = `${this.m_parentNode.value}/${this.m_inputDirName}/`
    }
    this.m_close(dirPath)
  }

  private m_clear(): void {
    this.m_inputDirName = ''
    this.m_removeDirNameIsRequired()
    this.m_dirNameInput.resetValidation()
  }

  private m_addDirNameIsRequired(): void {
    if (!this.m_dirNameRules.includes(this.m_dirNameIsRequired)) {
      this.m_dirNameRules.push(this.m_dirNameIsRequired)
    }
    this.m_dirNameInput.validate()
  }

  private m_removeDirNameIsRequired(): void {
    const index = this.m_dirNameRules.indexOf(this.m_dirNameIsRequired)
    if (index >= 0) {
      this.m_dirNameRules.splice(index, 1)
    }
  }

  //----------------------------------------------------------------------
  //
  //  Event listeners
  //
  //----------------------------------------------------------------------

  private m_dirNameInputOnInput() {
    this.m_addDirNameIsRequired()
  }

  private m_dialogOnShow() {
    this.m_clear()
    this.m_dirNameInput.focus()
  }

  private m_dialogOnBeforeHide() {
    this.m_clear()
  }

  private m_dialogOnHide() {
    this.m_resultResolve(this.m_resultDirPath)
    this.m_resultDirPath = ''
  }
}
</script>
