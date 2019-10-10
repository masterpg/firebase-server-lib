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

.error-message {
  @extend $text-caption
  color: $text-error-color
}
</style>

<template>
  <q-dialog v-model="m_opened" persistent>
    <!-- アカウント削除ビュー -->
    <q-card v-if="m_viewType.accountDelete.visible" class="container" :class="{ pc: screenSize.pc, tab: screenSize.tab, sp: screenSize.sp }">
      <!-- タイトル -->
      <q-card-section>
        <div class="title">Delete account</div>
      </q-card-section>

      <!-- コンテンツエリア -->
      <q-card-section>
        <div>
          Deleted account can not be recovered.<br />
          Are you sure you want to delete your account?
        </div>
      </q-card-section>

      <!-- エラーメッセージ -->
      <q-card-section v-show="!!m_errorMessage">
        <span class="error-message">{{ m_errorMessage }}</span>
      </q-card-section>

      <!-- ボタンエリア -->
      <q-card-section class="layout horizontal center end-justified">
        <!-- CANCELボタン -->
        <q-btn flat rounded color="primary" label="Cancel" @click="close()" />
        <!-- OKボタン -->
        <q-btn v-show="m_viewType.accountDelete.default.visible" flat rounded color="primary" label="OK" @click="m_delete()" />
        <!-- SIGN INボタン -->
        <q-btn v-show="m_viewType.accountDelete.signIn.visible" flat rounded color="primary" label="Sign in" @click="m_visibleProviderList()" />
      </q-card-section>
    </q-card>

    <!-- プロバイダリストビュー -->
    <provider-list-view
      v-if="m_viewType.providerList.visible"
      :visible-providers="m_visibleProviders"
      @select-google="m_selectGoogle()"
      @select-facebook="m_selectFacebook()"
      @select-email="m_selectEmail()"
      @select-anonymous="m_selectAnonymous()"
      @closed="close()"
    />

    <!-- サインインビュー -->
    <email-sign-in-view v-else-if="m_viewType.emailSignIn.visible" @signed-in="m_visibleAccountDelete()" @closed="close()" />
  </q-dialog>
</template>

<script lang="ts">
import { BaseComponent, ResizableMixin } from '@/components'
import { Component, Watch } from 'vue-property-decorator'
import { AuthProviderType } from '@/logic'
import EmailSignInView from '@/views/auth/email-sign-in-view.vue'
import ProviderListView from '@/views/auth/provider-list-view.vue'
import { mixins } from 'vue-class-component'

@Component({
  name: 'account-delete-dialog',
  components: {
    ProviderListView,
    EmailSignInView,
  },
})
export default class AccountDeleteDialog extends mixins(BaseComponent, ResizableMixin) {
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

  private m_viewType = new ViewType()

  private m_errorMessage: string = ''

  private m_visibleProviders: AuthProviderType[] = []

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  open(): void {
    this.m_opened = true
    this.m_visibleAccountDelete()
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

  private async m_delete(): Promise<void> {
    const deleteResult = await this.$logic.auth.deleteAccount()
    if (!deleteResult.result) {
      this.m_errorMessage = deleteResult.errorMessage
      // ユーザーの認証情報が古すぎる場合、再度サインインが必要
      if (deleteResult.code === 'auth/requires-recent-login') {
        this.m_viewType.set('accountDelete.signIn')
      }
      return
    }
    this.close()
  }

  private async m_selectGoogle(): Promise<void> {
    await this.$logic.auth.signInWithGoogle()
  }

  private async m_selectFacebook(): Promise<void> {
    await this.$logic.auth.signInWithFacebook()
  }

  private m_selectEmail(): void {
    this.m_viewType.set('emailSignIn')
  }

  private async m_selectAnonymous(): Promise<void> {
    await this.$logic.auth.signInAnonymously()
  }

  private m_visibleAccountDelete() {
    this.m_errorMessage = ''
    this.m_viewType.set('accountDelete.default')
  }

  private async m_visibleProviderList(): Promise<void> {
    const user = this.$logic.auth.user
    this.m_visibleProviders = await this.$logic.auth.fetchSignInMethodsForEmail(user.email)
    this.m_viewType.set('providerList')
  }
}

class ViewType {
  set(value: 'accountDelete.default' | 'accountDelete.signIn' | 'providerList' | 'emailSignIn'): void {
    this.accountDelete.visible = false
    this.accountDelete.default.visible = false
    this.accountDelete.signIn.visible = false
    this.providerList.visible = false
    this.emailSignIn.visible = false

    switch (value) {
      case 'accountDelete.default':
        this.accountDelete.visible = true
        this.accountDelete.default.visible = true
        break
      case 'accountDelete.signIn':
        this.accountDelete.visible = true
        this.accountDelete.signIn.visible = true
        break
      case 'providerList':
        this.providerList.visible = true
        break
      case 'emailSignIn':
        this.emailSignIn.visible = true
        break
    }
  }

  accountDelete = {
    visible: false,
    default: { visible: false },
    signIn: { visible: false },
  }
  providerList = { visible: false }
  emailSignIn = { visible: false }
}
</script>
