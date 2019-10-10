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

.emphasis {
  font-weight: $text-weights.medium
}

.error-message {
  @extend $text-caption
  color: $text-error-color
}
</style>

<template>
  <q-dialog v-model="m_opened" persistent>
    <!-- サインインビュー -->
    <email-sign-in-view v-if="m_viewType === 'signIn'" @signed-in="m_signInViewOnSignedIn()" @closed="close()" />

    <!-- メールアドレス変更ビュー -->
    <q-card v-else-if="m_viewType === 'emailChange'" class="container" :class="{ pc: screenSize.pc, tab: screenSize.tab, sp: screenSize.sp }">
      <!-- タイトル -->
      <q-card-section>
        <div class="title">Change email</div>
      </q-card-section>

      <!-- コンテンツエリア -->
      <q-card-section>
        <!-- メールアドレスインプット -->
        <q-input
          v-show="m_viewType === 'emailChange'"
          ref="emailInput"
          v-model="m_inputEmail"
          type="email"
          name="email"
          label="Email"
          :rules="m_emailRules"
          @input="m_clearErrorMessage()"
        >
          <template v-slot:prepend>
            <q-icon name="mail" />
          </template>
        </q-input>
      </q-card-section>

      <!-- エラーメッセージ -->
      <q-card-section v-show="!!m_errorMessage">
        <span class="error-message">{{ m_errorMessage }}</span>
      </q-card-section>

      <!-- ボタンエリア -->
      <q-card-section align="right">
        <!-- CANCELボタン -->
        <q-btn v-show="m_viewType === 'emailChange'" flat rounded color="primary" label="Cancel" @click="close()" />
        <!-- NEXTボタン -->
        <q-btn v-show="m_viewType === 'emailChange'" flat rounded color="primary" label="Next" @click="m_changeEmail()" />
      </q-card-section>
    </q-card>

    <!-- メールアドレス検証中ビュー -->
    <q-card v-else-if="m_viewType === 'inVerification'" class="container" :class="{ pc: screenSize.pc, tab: screenSize.tab, sp: screenSize.sp }">
      <!-- タイトル -->
      <q-card-section>
        <div class="title">Change email</div>
      </q-card-section>

      <!-- コンテンツエリア -->
      <q-card-section>
        <div>
          Follow the instructions sent to <span class="emphasis">{{ m_inputEmail }}</span> to verify your email.
        </div>
      </q-card-section>

      <!-- ボタンエリア -->
      <q-card-section align="right">
        <!-- CLOSEボタン -->
        <q-btn flat rounded color="primary" label="Close" @click="close()" />
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { BaseComponent, ResizableMixin } from '@/components'
import { Component, Watch } from 'vue-property-decorator'
import EmailSignInView from '@/views/auth/email-sign-in-view.vue'
import { NoCache } from '@/base/decorators'
import { QInput } from 'quasar'
import { mixins } from 'vue-class-component'
const isEmail = require('validator/lib/isEmail')

@Component({
  name: 'email-change-dialog',
  components: {
    EmailSignInView,
  },
})
export default class EmailChangeDialog extends mixins(BaseComponent, ResizableMixin) {
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

  private m_viewType: 'signIn' | 'emailChange' | 'inVerification' = 'signIn'

  private m_inputEmail: string = ''

  private m_errorMessage: string = ''

  private m_emailRules = [val => !!val || 'Email is a required.', val => (!!val && isEmail(val)) || 'Email is invalid.']

  //--------------------------------------------------
  //  Elements
  //--------------------------------------------------

  @NoCache
  private get m_emailInput(): QInput {
    return this.$refs.emailInput as any
  }

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  open(): void {
    this.m_opened = true
    this.m_inputEmail = ''
    this.m_clearErrorMessage()
    this.m_viewType = 'signIn'
  }

  close(): void {
    this.m_opened = false
    this.$emit('closed')
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  /**
   * エラーメッセージをクリアします。
   */
  private m_clearErrorMessage(): void {
    this.m_errorMessage = ''
  }

  /**
   * メールアドレスの変更を実行します。
   */
  private async m_changeEmail(): Promise<void> {
    if (this.m_emailInput.hasError) return
    // メールアドレスを変更
    // (変更前のメールアドレスに変更通知のメールが送られる)
    await this.$logic.auth.updateEmail(this.m_inputEmail)
    // 変更されたメールアドレスに確認メールを送信
    await this.$logic.auth.sendEmailVerification('http://localhost:5000')
    // 画面をメールアドレス検証中へ変更
    this.m_viewType = 'inVerification'
  }

  //----------------------------------------------------------------------
  //
  //  Event listeners
  //
  //----------------------------------------------------------------------

  private m_signInViewOnSignedIn() {
    this.m_viewType = 'emailChange'
    this.$nextTick(() => this.m_emailInput.focus())
  }
}
</script>
