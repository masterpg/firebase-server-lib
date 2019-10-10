<style lang="stylus" scoped>
@import '../../../../styles/app.variables.styl'

.container {
  &.pc, &.tab {
    width: 340px
  }
  &.sp {
    min-width: 280px
  }
}

.title {
  @extend $text-h6
}

.emphasis {
  font-weight: $text-weights.medium
}

.error-message {
  @extend $text-caption
  color: $text-error-color
}
</style>

<template>
  <q-card class="container" :class="{ pc: screenSize.pc, tab: screenSize.tab, sp: screenSize.sp }">
    <!-- タイトル -->
    <q-card-section>
      <div class="title">Reset password</div>
    </q-card-section>

    <!-- コンテンツエリア -->
    <q-card-section>
      <!-- メールアドレスリセットメッセージ -->
      <div>
        Get instructions sent to <span class="emphasis">{{ email }}</span> that explain how to reset your password.
      </div>
    </q-card-section>

    <!-- エラーメッセージ -->
    <q-card-section v-show="!!m_errorMessage">
      <span class="error-message">{{ m_errorMessage }}</span>
    </q-card-section>

    <!-- ボタンエリア -->
    <q-card-section class="layout horizontal center end-justified">
      <!-- CANCELボタン -->
      <q-btn v-show="m_viewType === 'confirm'" flat rounded color="primary" label="Cancel" @click="m_close()" />
      <!-- SENDボタン -->
      <q-btn v-show="m_viewType === 'confirm'" flat rounded color="primary" label="Send" @click="m_reset()" />
      <!-- CLOSEボタン -->
      <q-btn v-show="m_viewType === 'sent'" flat rounded color="primary" label="Close" @click="m_close()" />
    </q-card-section>
  </q-card>
</template>

<script lang="ts">
import { BaseComponent, ResizableMixin } from '@/components'
import { Component, Prop } from 'vue-property-decorator'
import { mixins } from 'vue-class-component'
import { router } from '@/base/router'

@Component({
  name: 'password-reset-view',
  components: {},
})
export default class PasswordResetView extends mixins(BaseComponent, ResizableMixin) {
  //----------------------------------------------------------------------
  //
  //  Properties
  //
  //----------------------------------------------------------------------

  @Prop({ default: '', required: true })
  email!: string

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  private m_viewType: 'confirm' | 'sent' = 'confirm'

  private m_errorMessage: string = ''

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  /**
   * パスワードリセットを行います。
   */
  private async m_reset(): Promise<void> {
    // アカウントのメールアドレスにパスワードリセットのメールを送信
    const sendInResult = await this.$logic.auth.sendPasswordResetEmail(this.email, 'http://localhost:5000')
    if (!sendInResult.result) {
      if (sendInResult.code) {
        this.m_errorMessage = sendInResult.errorMessage
      } else {
        console.error(sendInResult.errorMessage)
        this.m_errorMessage = 'Failed to send password reset email.'
      }
      return
    }
    // 画面をパスワードリセットへ変更
    this.m_viewType = 'sent'
  }

  private m_close(): void {
    router.closeDialog()
    this.$emit('closed')
  }
}
</script>
