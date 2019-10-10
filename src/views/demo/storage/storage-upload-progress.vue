<style lang="stylus" scoped>
@import '../../../styles/app.variables.styl'

.main {
  margin: 10px
  border-radius: 2px
  box-shadow: $shadow-2

  &.pc, &.tab {
    width: 340px
  }
  &.sp {
    width: 270px
  }

  .title {
    @extend $text-caption
  }
}

.bar {
  background-color: $primary
  color: white
  border-radius: 2px 2px 0 0
}

.content {
  overflow-y: auto
  max-height: 120px
  transition: max-height 0.5s

  &.minimize {
    max-height: 0
  }
}

.item {
  @extend $text-caption
  margin: 4px

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .error {
    color: $text-error-color
    text-align: right
  }

  & > *:not(:first-child) {
    margin-left: 4px
  }
}
</style>

<template>
  <div class="main animated fadeInUp" :class="{ fadeOutDown: !m_opened, pc: screenSize.pc, tab: screenSize.tab, sp: screenSize.sp }">
    <q-bar class="bar">
      <div class="title">{{ $t('storage.uploadTotalRatio', [m_uploadManager.uploadedCount, m_uploadManager.totalUploadCount]) }}</div>
      <q-space />
      <q-btn v-if="m_minimize" dense flat icon="maximize" size="xs" @click="m_maximizeButtonOnClick()"> </q-btn>
      <q-btn v-else dense flat icon="minimize" size="xs" @click="m_minimizeButtonOnClick()"> </q-btn>
      <q-btn v-show="m_uploadManager.completed" dense flat icon="close" @click="m_closeButtonOnClick()"></q-btn>
    </q-bar>
    <div class="content" :class="{ minimize: m_minimize }">
      <div v-for="(item, index) in m_uploadManager.uploadingFiles" :key="index" class="layout horizontal center item">
        <div class="name flex-8">{{ item.name }}</div>
        <q-linear-progress v-if="!item.failed" :value="item.progress" :stripe="!item.completed" size="md" class="flex-4" />
        <div v-else class="error flex-4">{{ $t('storage.uploadFileFailed') }}</div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { BaseComponent, ResizableMixin } from '@/components'
import { Component, Watch } from 'vue-property-decorator'
import { StorageUploadManager } from '@/logic'
import { mixins } from 'vue-class-component'

@Component({ name: 'storage-upload-progress' })
export default class StorageUploadProgress extends mixins(BaseComponent, ResizableMixin) {
  //----------------------------------------------------------------------
  //
  //  Lifecycle hooks
  //
  //----------------------------------------------------------------------

  async mounted() {
    this.m_uploadManager = this.$logic.storage.newUserUploadManager(this.$el)
    // this.m_uploadManager = this.$logic.storage.newAdminUploadManager(this.$el)
  }

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  private m_opened: boolean = false

  private m_uploadManager: StorageUploadManager = {} as any

  @Watch('m_uploadManager.uploading')
  private m_m_uploadManagerUploadingOnChange(newValue: boolean, oldValue: boolean): void {
    // アップロードマネージャの状態がアップロード中になったら自コンポーネントを開く
    this.m_opened = newValue
  }

  private m_minimize: boolean = false

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  /**
   * OSのファイル選択ダイアログを表示します。
   * @param uploadDirPath
   */
  openFilesSelectDialog(uploadDirPath: string): void {
    this.m_uploadManager.openFilesSelectDialog(uploadDirPath)
  }

  /**
   * OSのフォルダ選択ダイアログを表示します。
   * @param uploadDirPath
   */
  openDirSelectDialog(uploadDirPath: string): void {
    this.m_uploadManager.openDirSelectDialog(uploadDirPath)
  }

  //----------------------------------------------------------------------
  //
  //  Event listeners
  //
  //----------------------------------------------------------------------

  private m_maximizeButtonOnClick() {
    this.m_minimize = false
  }

  private m_minimizeButtonOnClick() {
    this.m_minimize = true
  }

  private m_closeButtonOnClick() {
    this.m_opened = false
    // 閉じるアニメショーンと同時にアップロードマネージャをクリアすると、アニメショーンが
    // ガタつくので、アニメショーンが終わってからアップロードマネージャをクリアしている
    setTimeout(() => {
      this.m_uploadManager.clear()
    }, 500)
  }
}
</script>
