<style lang="stylus" scoped>
@import '../../../styles/app.variables.styl'
</style>

<template>
  <q-dialog v-model="m_opened" persistent>
    <provider-list-view
      v-if="m_state === 'list'"
      @select-google="m_selectGoogle()"
      @select-facebook="m_selectFacebook()"
      @select-email="m_selectEmail()"
      @select-anonymous="m_selectAnonymous()"
      @closed="close()"
    />
    <email-auth-view v-else-if="m_state === 'email'" @signed-in="close()" @closed="close()" />
  </q-dialog>
</template>

<script lang="ts">
import { BaseComponent, ResizableMixin } from '@/components'
import { Component, Watch } from 'vue-property-decorator'
import EmailAuthView from '@/views/auth/sign-in-dialog/email-auth-view/index.vue'
import ProviderListView from '@/views/auth/provider-list-view.vue'
import { mixins } from 'vue-class-component'
import { router } from '@/base/router'

@Component({
  name: 'sign-in-dialog',
  components: {
    EmailAuthView,
    ProviderListView,
  },
})
export default class SignInDialog extends mixins(BaseComponent, ResizableMixin) {
  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  private m_state: 'list' | 'email' = 'list'

  private m_opened: boolean = false

  @Watch('m_opened')
  private m_openedChanged(newValue: boolean, oldValue: boolean) {
    if (!newValue) {
      this.$emit('closed')
    }
  }

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  open(): void {
    this.m_state = 'list'
    this.m_opened = true
  }

  close(): void {
    this.m_opened = false
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  private async m_selectGoogle(): Promise<void> {
    router.closeDialog()
    await this.$logic.auth.signInWithGoogle()
  }

  private async m_selectFacebook(): Promise<void> {
    router.closeDialog()
    await this.$logic.auth.signInWithFacebook()
  }

  private m_selectEmail(): void {
    this.m_state = 'email'
  }

  private async m_selectAnonymous(): Promise<void> {
    router.closeDialog()
    await this.$logic.auth.signInAnonymously()
  }
}
</script>
