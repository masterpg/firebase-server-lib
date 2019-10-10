import {AuthProviderType} from '../../logic'
<style lang="stylus" scoped>
@import '../../styles/app.variables.styl'

.container {}

.sign-in-button {
  width: 220px
  height: 40px
  border: none
  padding: 0 20px
  cursor: pointer
  box-shadow: $shadow-2

  &:not(:first-child) {
    margin-top: 20px
  }

  &.google {
    background-color: white
    color: $text-secondary-color
  }

  &.facebook {
    background-color: #3b5998
    color: white
  }

  &.email {
    background-color: #db4437
    color: white
  }

  &.anonymous {
    background-color: #f4b400
    color: white
  }

  .icon {
    width: 18px
    height: 18px
  }

  .label {
    @extend $text-body2
    font-weight: $text-weights.medium
    margin-left: 16px
  }

  * {
    pointer-events: none
  }
}

.sign-in-button:not(:first-child) {
  margin-top: 20px
}

.title {
  @extend $text-h6
}
</style>

<template>
  <q-card class="container">
    <!-- タイトル -->
    <q-card-section>
      <div class="title">Sign in</div>
    </q-card-section>

    <!-- プロバイダリスト -->
    <q-card-section>
      <div
        v-show="m_visibleGoogleProvider"
        ref="googleSignInButton"
        class="layout horizontal center sign-in-button google"
        @click="m_signInWithGoogle()"
      >
        <img class="icon" src="@/assets/icons/google.svg" />
        <div class="label">Sign in with Google</div>
      </div>

      <div
        v-show="m_visibleFacebookProvider"
        ref="facebookSignInButton"
        class="layout horizontal center sign-in-button facebook"
        @click="m_signInWithFacebook()"
      >
        <img class="icon" src="@/assets/icons/facebook.svg" />
        <div class="label">Sign in with Facebook</div>
      </div>

      <div
        v-show="m_visiblePasswordProvider"
        ref="emailSignInButton"
        class="layout horizontal center sign-in-button email"
        @click="m_signInWithEmail()"
      >
        <img class="icon" src="@/assets/icons/mail.svg" />
        <div class="label">Sign in with Email</div>
      </div>

      <div
        v-show="m_visibleAnonymousProvider"
        ref="anonymousSignInButton"
        class="layout horizontal center sign-in-button anonymous"
        @click="m_signInWithAnonymous()"
      >
        <q-icon name="person_outline" size="18px" />
        <div class="label">Continue as guest</div>
      </div>
    </q-card-section>

    <!-- ボタンエリア -->
    <q-card-actions align="right">
      <q-btn flat rounded color="primary" label="Cancel" @click="m_close()" />
    </q-card-actions>
  </q-card>
</template>

<script lang="ts">
import { BaseComponent, ResizableMixin } from '@/components'
import { Component, Prop } from 'vue-property-decorator'
import { AuthProviderType } from '@/logic'
import { mixins } from 'vue-class-component'

@Component({
  name: 'provider-list-view',
  components: {},
})
export default class ProviderListView extends mixins(BaseComponent, ResizableMixin) {
  //----------------------------------------------------------------------
  //
  //  Properties
  //
  //----------------------------------------------------------------------

  @Prop({ default: () => [AuthProviderType.Google, AuthProviderType.Facebook, AuthProviderType.Password, AuthProviderType.Anonymous] })
  visibleProviders!: AuthProviderType[]

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  private get m_visibleGoogleProvider() {
    return this.visibleProviders.indexOf(AuthProviderType.Google) >= 0
  }

  private get m_visibleFacebookProvider() {
    return this.visibleProviders.indexOf(AuthProviderType.Facebook) >= 0
  }

  private get m_visiblePasswordProvider() {
    return this.visibleProviders.indexOf(AuthProviderType.Password) >= 0
  }

  private get m_visibleAnonymousProvider() {
    return this.visibleProviders.indexOf(AuthProviderType.Anonymous) >= 0
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  private async m_signInWithGoogle() {
    this.$emit('select-google')
  }

  private async m_signInWithFacebook() {
    this.$emit('select-facebook')
  }

  private async m_signInWithEmail() {
    this.$emit('select-email')
  }

  private async m_signInWithAnonymous() {
    this.$emit('select-anonymous')
  }

  private m_close() {
    this.$emit('closed')
  }
}
</script>
