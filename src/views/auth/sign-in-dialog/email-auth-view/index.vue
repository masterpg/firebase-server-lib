<style lang="stylus" scoped>
@import '../../../../styles/app.variables.styl'

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
  <div>
    <!-- メールアドレスによるアカウント登録・サインインビュー -->
    <q-card v-if="m_viewType !== 'passwordReset'" class="container" :class="{ pc: screenSize.pc, tab: screenSize.tab, sp: screenSize.sp }">
      <q-form>
        <!-- タイトル -->
        <q-card-section>
          <div class="title">{{ m_title }}</div>
        </q-card-section>

        <!-- コンテンツエリア -->
        <q-card-section>
          <!-- メールアドレスインプット -->
          <q-input
            v-show="m_viewType !== 'inVerification'"
            ref="emailInput"
            v-model="m_inputEmail"
            type="email"
            name="email"
            label="Email"
            class="app-pb-20"
            :rules="m_emailRules"
            :readonly="m_viewType !== 'first'"
          >
            <template v-slot:prepend>
              <q-icon name="mail" />
            </template>
          </q-input>

          <!-- 表示名インプット -->
          <q-input
            v-show="m_viewType === 'create'"
            ref="displayNameInput"
            v-model="m_inputDisplayName"
            type="text"
            name="displayName"
            label="Display name"
            :rules="m_displayNameRules"
            @input="m_clearErrorMessage()"
          />

          <!-- パスワードインプット -->
          <q-input
            v-show="m_viewType === 'create' || m_viewType === 'signIn'"
            ref="passwordInput"
            v-model="m_inputPassword"
            type="password"
            name="password"
            label="Password"
            :rules="m_passwordRules"
            @input="m_clearErrorMessage()"
          />

          <!-- メールアドレス検証中メッセージ -->
          <div v-show="m_viewType === 'inVerification'">
            Follow the instructions sent to <span class="emphasis">{{ m_inputEmail }}</span> to verify your email.
          </div>
        </q-card-section>

        <!-- エラーメッセージ -->
        <q-card-section v-show="!!m_errorMessage">
          <span class="error-message">{{ m_errorMessage }}</span>
        </q-card-section>

        <!-- ボタンエリア -->
        <q-card-section class="layout horizontal center end-justified">
          <!-- メールアドレスリセットリンク -->
          <div v-show="m_viewType === 'signIn'" class="app-pseudo-link" @click="m_resetPassword()">Trouble signing in?</div>
          <!-- スペーサー -->
          <div class="flex"></div>
          <!-- CANCELボタン -->
          <q-btn v-show="m_viewType !== 'inVerification'" flat rounded color="primary" label="Cancel" @click="m_close()" />
          <!-- NEXTボタン -->
          <q-btn v-show="m_viewType === 'first'" flat rounded color="primary" label="Next" @click="m_next()" />
          <!-- CREATEボタン -->
          <q-btn v-show="m_viewType === 'create'" flat rounded color="primary" label="Create" @click="m_create()" />
          <!-- SIGN INボタン -->
          <q-btn v-show="m_viewType === 'signIn'" flat rounded color="primary" label="Sign in" @click="m_signIn()" />
        </q-card-section>
      </q-form>
    </q-card>

    <!-- パスワードリセットビュー -->
    <password-reset-view v-else-if="m_viewType === 'passwordReset'" :email="m_inputEmail" @closed="m_close()" />
  </div>
</template>

<script lang="ts">
import { BaseComponent, ResizableMixin } from '@/components'
import { AuthProviderType } from '@/logic'
import { Component } from 'vue-property-decorator'
import { NoCache } from '@/base/decorators'
import PasswordResetView from '@/views/auth/sign-in-dialog/email-auth-view/password-reset-view.vue'
import { QInput } from 'quasar'
import { mixins } from 'vue-class-component'
const isEmail = require('validator/lib/isEmail')
import { router } from '@/base/router'

@Component({
  name: 'email-auth-view',
  components: {
    PasswordResetView,
  },
})
export default class EmailAuthView extends mixins(BaseComponent, ResizableMixin) {
  //----------------------------------------------------------------------
  //
  //  Lifecycle hooks
  //
  //----------------------------------------------------------------------

  mounted() {
    this.m_emailInput.focus()
  }

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  private m_viewType: 'first' | 'create' | 'signIn' | 'inVerification' | 'passwordReset' = 'first'

  private m_inputEmail: string = ''

  private m_inputDisplayName: string = ''

  private m_inputPassword: string = ''

  private m_errorMessage: string = ''

  private m_emailRules = [val => !!val || 'Email is a required.', val => (!!val && isEmail(val)) || 'Email is invalid.']

  private m_displayNameRules = [val => !!val || 'Display name is a required.']

  private m_passwordRules = [val => !!val || 'Password is a required.']

  private get m_title() {
    switch (this.m_viewType) {
      case 'first':
        return 'Input email'
      case 'create':
        return 'Create account'
      case 'signIn':
        return 'Sign in'
      case 'inVerification':
        return 'Email in verification'
    }
    return ''
  }

  //--------------------------------------------------
  //  Elements
  //--------------------------------------------------

  @NoCache
  private get m_emailInput(): QInput {
    return this.$refs.emailInput as any
  }

  @NoCache
  private get m_displayNameInput(): QInput {
    return this.$refs.displayNameInput as any
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
   * 次の画面の設定を行います。
   */
  private async m_next(): Promise<void> {
    if (this.m_emailInput.hasError) return

    // 入力されたメールアドレスの認証プロバイダを取得
    const providers = await this.$logic.auth.fetchSignInMethodsForEmail(this.m_inputEmail)

    // 取得した認証プロバイダの中にパスワード認証があるかを取得
    const passwordProviderContains = providers.some(provider => provider === AuthProviderType.Password)

    // パスワード認証があった場合、サインイン画面へ遷移
    if (passwordProviderContains) {
      this.m_viewType = 'signIn'
      this.$nextTick(() => this.m_passwordInput.focus())
    }
    // パスワード認証がなかった場合、アカウント作成画面へ遷移
    else {
      this.m_viewType = 'create'
      this.$nextTick(() => this.m_displayNameInput.focus())
    }
  }

  /**
   * アカウント作成を行います。
   */
  private async m_create(): Promise<void> {
    // メールアドレス＋パスワードでアカウントを作成
    const createResult = await this.$logic.auth.createUserWithEmailAndPassword(this.m_inputEmail, this.m_inputPassword, {
      displayName: this.m_inputDisplayName,
      photoURL: null,
    })
    if (!createResult.result) {
      if (createResult.code) {
        this.m_errorMessage = createResult.errorMessage
      } else {
        console.error(createResult.errorMessage)
        this.m_errorMessage = 'Account creation failed.'
      }
      return
    }

    // 作成されたアカウントのメールアドレスに確認メールを送信
    await this.$logic.auth.sendEmailVerification('http://localhost:5000')
    // メールアドレス検証中
    this.m_inVerification()
  }

  /**
   * サインインを行います。
   */
  private async m_signIn(): Promise<void> {
    // メールアドレス＋パスワードでサインイン
    const signInResult = await this.$logic.auth.signInWithEmailAndPassword(this.m_inputEmail, this.m_inputPassword)
    if (!signInResult.result) {
      if (signInResult.code) {
        this.m_errorMessage = signInResult.errorMessage
      } else {
        console.error(signInResult.errorMessage)
        this.m_errorMessage = 'Sign in failed.'
      }
      return
    }

    // メールアドレス確認が行われている場合
    if (this.$logic.auth.user.emailVerified) {
      // サインイン完了
      this.m_close()
    }
    // メールアドレス確認が行われていない場合
    else {
      // // アカウントのメールアドレスに確認メールを送信
      await this.$logic.auth.sendEmailVerification('http://localhost:5000')
      // メールアドレス検証中
      this.m_inVerification()
    }
  }

  /**
   * 画面をメールアドレス検証中に変更します。
   */
  private m_inVerification(): void {
    this.m_viewType = 'inVerification'
    router.closeDialog()
  }

  /**
   * パスワードリセット画面へ遷移します。
   */
  private m_resetPassword(): void {
    this.m_viewType = 'passwordReset'
  }

  private m_close() {
    this.$emit('closed')
  }
}
</script>
