<style lang="stylus" scoped>
@import '../../styles/app.variables.styl'

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
  <q-card class="container" :class="{ pc: screenSize.pc, tab: screenSize.tab, sp: screenSize.sp }">
    <q-form>
      <!-- タイトル -->
      <q-card-section>
        <div class="title">Sign in</div>
      </q-card-section>

      <!-- コンテンツエリア -->
      <q-card-section>
        <!-- メールアドレスインプット -->
        <q-input
          v-show="m_viewType === 'signIn'"
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

        <!-- パスワードインプット -->
        <q-input
          v-show="m_viewType === 'signIn'"
          ref="passwordInput"
          v-model="m_inputPassword"
          type="password"
          name="password"
          label="Password"
          :rules="m_passwordRules"
          @input="m_clearErrorMessage()"
        />

        <!-- メールアドレス未検証メッセージ -->
        <div v-show="m_viewType === 'unverified'">
          <span class="emphasis">{{ m_inputEmail }}</span> has not been identified yet.
        </div>
      </q-card-section>

      <!-- エラーメッセージ -->
      <q-card-section v-show="!!m_errorMessage">
        <span class="error-message">{{ m_errorMessage }}</span>
      </q-card-section>

      <!-- ボタンエリア -->
      <q-card-section class="layout horizontal center end-justified">
        <!-- CANCELボタン -->
        <q-btn flat rounded color="primary" label="Cancel" @click="m_close()" />
        <!-- SIGN INボタン -->
        <q-btn v-show="m_viewType === 'signIn'" flat rounded color="primary" label="Sign in" @click="m_signIn()" />
      </q-card-section>
    </q-form>
  </q-card>
</template>

<script lang="ts">
import { BaseComponent, ResizableMixin } from '@/components'
import { Component } from 'vue-property-decorator'
import { NoCache } from '@/base/decorators'
import { QInput } from 'quasar'
import { mixins } from 'vue-class-component'
const isEmail = require('validator/lib/isEmail')

@Component({
  name: 'email-sign-in-view',
  components: {},
})
export default class EmailSignInView extends mixins(BaseComponent, ResizableMixin) {
  //----------------------------------------------------------------------
  //
  //  Lifecycle hooks
  //
  //----------------------------------------------------------------------

  mounted() {
    setTimeout(() => this.m_emailInput.focus(), 100)
  }

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  private m_viewType: 'signIn' | 'unverified' = 'signIn'

  private m_inputEmail: string = ''

  private m_inputPassword: string = ''

  private m_errorMessage: string = ''

  private m_emailRules = [val => !!val || 'Email is a required.', val => (!!val && isEmail(val)) || 'Email is invalid.']

  private m_passwordRules = [val => !!val || 'Password is a required.']

  //--------------------------------------------------
  //  Elements
  //--------------------------------------------------

  @NoCache
  private get m_emailInput(): QInput {
    return this.$refs.emailInput as any
  }

  @NoCache
  private get m_passwordInput(): QInput {
    return this.$refs.passwordInput as any
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
   * サインインを行います。
   */
  private async m_signIn(): Promise<void> {
    if (this.m_emailInput.hasError || this.m_passwordInput.hasError) return

    // メールアドレス＋パスワードでサインイン
    const signInResult = await this.$logic.auth.signInWithEmailAndPassword(this.m_inputEmail, this.m_inputPassword)
    if (!signInResult.result) {
      this.m_errorMessage = signInResult.errorMessage
      return
    }

    // メールアドレス確認が行われている場合
    if (this.$logic.auth.user.emailVerified) {
      // サインイン完了
      this.$emit('signed-in', this.m_inputEmail)
    }
    // メールアドレス確認が行われていない場合
    else {
      // 画面をメールアドレス未検証へ変更
      this.m_viewType = 'unverified'
    }
  }

  private m_close() {
    this.$emit('closed')
  }
}
</script>
