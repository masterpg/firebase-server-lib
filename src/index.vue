<style lang="stylus" scoped>
@import './styles/app.variables.styl'

.header {
  background-color: $indigo-5

  .photo {
    width: 32px;
    height: 32px;
    border-radius: 50%;
  }
}

.menu-list {
  min-width: 150px
}

.container {
  height: 100vh
}

.drawer-scroll-area {
  height: 100%
}

/* -----> */
/**
 * Animate.cssにある既存のアニメーションをコピーして変更している。
 * コピー元: node_modules/animate.css/animate.css
 */
@keyframes tada {
  from {
    transform: scale3d(1, 1, 1)
  }
  10%,
  20% {
    transform: scale3d(0.9, 0.9, 0.9) rotate3d(0, 0, 1, -3deg)
  }
  30%,
  70% {
    transform: scale3d(1.1, 1.1, 1.1) rotate3d(0, 0, 1, 3deg)
  }
  50%,
  80% {
    transform: scale3d(1.1, 1.1, 1.1) rotate3d(0, 0, 1, -3deg)
  }
  to {
    transform: scale3d(1, 1, 1)
  }
}

.tada {
  animation-name: tada
}
/* <----- */

/* -----> */
/**
 * tada と bounceOutRight のアニメーションスピードを調整
 */
.animated.tada.faster {
  animation-duration: 700ms
}

.animated.bounceOutRight.faster {
  animation-duration: 700ms
}
/* <----- */

/**
 * フェードイン/アウトのサンプル。このアニメーションを有効にするには、下記のコメントを外し、
 * transitionタグの enter-active-class と leave-active-class を削除るとこのアニメーションが有効になる。
 */
/*
.view-enter-active,
.view-leave-active {
  transition: opacity 0.2s ease
}
.view-enter,
.view-leave-to {
  opacity: 0
}
*/
</style>

<template>
  <q-layout view="lHh Lpr lFf" @component-resize.native="m_onComponentResize">
    <q-header elevated class="glossy header">
      <q-toolbar>
        <q-btn flat dense round aria-label="Menu" icon="menu" @click="m_leftDrawerOpen = !m_leftDrawerOpen" />

        <q-toolbar-title>
          Quasar App
        </q-toolbar-title>

        <div class="app-mr-16">Quasar v{{ $q.version }}</div>

        <q-img v-show="m_user.isSignedIn && !!m_user.photoURL" :src="m_user.photoURL" contain class="photo app-mr-6"></q-img>
        <q-icon v-show="m_user.isSignedIn && !m_user.photoURL" name="person" size="26px" class=" app-mr-6"></q-icon>
        <q-btn flat round dense color="white" icon="more_vert">
          <q-menu>
            <q-list class="menu-list">
              <q-item v-show="!m_user.isSignedIn" v-close-popup clickable>
                <q-item-section @click="m_signInMenuItemOnClick">Sign in</q-item-section>
              </q-item>
              <q-item v-show="m_user.isSignedIn" v-close-popup clickable>
                <q-item-section @click="m_signOutMenuItemOnClick">Sign out</q-item-section>
              </q-item>
              <q-item v-show="m_user.isSignedIn" v-close-popup clickable>
                <q-item-section @click="m_changeEmailMenuItemOnClick">Change email</q-item-section>
              </q-item>
              <q-item v-show="m_user.isSignedIn" v-close-popup clickable>
                <q-item-section @click="m_deleteAccountMenuItemOnClick">Delete account</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </q-toolbar>
    </q-header>

    <q-drawer v-model="m_leftDrawerOpen" :width="300" :breakpoint="500" show-if-above bordered content-class="bg-grey-2">
      <q-scroll-area class="drawer-scroll-area">
        <q-list padding>
          <template v-for="(item, index) in m_items">
            <q-item :key="index" v-ripple :to="item.path" clickable>
              <q-item-section avatar>
                <q-icon :name="item.icon" />
              </q-item-section>
              <q-item-section>{{ item.title }}</q-item-section>
            </q-item>
          </template>
        </q-list>
        <q-expansion-item icon="code" label="Demo">
          <q-list padding>
            <template v-for="(item, index) in m_demoItems">
              <q-item :key="index" v-ripple :to="item.path" clickable class="app-ml-20">
                <q-item-section>{{ item.title }}</q-item-section>
              </q-item>
            </template>
          </q-list>
        </q-expansion-item>
      </q-scroll-area>
    </q-drawer>

    <q-page-container class="container">
      <transition name="view" mode="out-in" enter-active-class="animated tada faster" leave-active-class="animated bounceOutRight faster">
        <router-view />
      </transition>
    </q-page-container>

    <sign-in-dialog ref="signInDialog" @closed="m_dialogOnClosed"></sign-in-dialog>
    <email-change-dialog ref="emailChangeDialog" @closed="m_dialogOnClosed"></email-change-dialog>
    <account-delete-dialog ref="accountDeleteDialog" @closed="m_dialogOnClosed"></account-delete-dialog>
  </q-layout>
</template>

<script lang="ts">
import * as sw from '@/base/service-worker'
import { BaseComponent, ResizableMixin } from '@/components'
import { Component, Watch } from 'vue-property-decorator'
import AccountDeleteDialog from '@/views/auth/account-delete-dialog/index.vue'
import EmailChangeDialog from '@/views/auth/email-change-dialog/index.vue'
import { NoCache } from '@/base/decorators'
import { Route } from 'vue-router/types/router'
import SignInDialog from '@/views/auth/sign-in-dialog/index.vue'
import { User } from '@/logic'
import { mixins } from 'vue-class-component'
import { router } from '@/base/router'

enum DialogType {
  SignIn = 'signIn',
  AccountDelete = 'accountDelete',
  EmailChange = 'emailChange',
}

@Component({
  name: 'app-page',
  components: {
    SignInDialog,
    EmailChangeDialog,
    AccountDeleteDialog,
  },
})
export default class AppPage extends mixins(BaseComponent, ResizableMixin) {
  //----------------------------------------------------------------------
  //
  //  Lifecycle hooks
  //
  //----------------------------------------------------------------------

  async created() {
    sw.addStateChangeListener(this.m_swOnStateChange)

    this.m_leftDrawerOpen = this.$q.platform.is.desktop

    await this.$logic.shop.pullProducts()
  }

  @Watch('$route')
  private m_$routeOnChange(to: Route, from: Route) {
    const dialog = router.getDialog(to)
    if (dialog) {
      switch (dialog.name) {
        case DialogType.SignIn:
          this.$nextTick(() => this.m_signInDialog.open())
          break
        case DialogType.EmailChange:
          this.$nextTick(() => this.m_emailChangeDialog.open())
          break
        case DialogType.AccountDelete:
          this.$nextTick(() => this.m_userDeleteDialog.open())
          break
      }
    }
  }

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  private m_items: Array<{ title: string; path: string; icon: string }> = [
    {
      title: 'ABC',
      path: router.views.abcPage.path,
      icon: 'inbox',
    },
    {
      title: 'Shopping',
      path: router.views.shopPage.path,
      icon: 'star',
    },
  ]

  private m_demoItems: Array<{ title: string; path: string }> = [
    {
      title: 'comp-tree-view',
      path: router.views.demo.compTreeViewPage.path,
    },
    {
      title: 'Cloud Storage',
      path: router.views.demo.storage.path,
    },
  ]

  private m_leftDrawerOpen: boolean = false

  private m_swUpdateIsRequired: boolean = false

  private get m_user(): User {
    const user = this.$logic.auth.user
    if (user.isSignedIn) {
      this.$logic.shop.pullCartItems()
    }
    return user
  }

  //--------------------------------------------------
  //  Elements
  //--------------------------------------------------

  @NoCache
  private get m_signInDialog(): SignInDialog {
    return this.$refs.signInDialog as any
  }

  @NoCache
  private get m_emailChangeDialog(): EmailChangeDialog {
    return this.$refs.emailChangeDialog as any
  }

  @NoCache
  private get m_userDeleteDialog(): AccountDeleteDialog {
    return this.$refs.accountDeleteDialog as any
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  /**
   * サインインダイアログを表示します。
   */
  private m_showSignInDialog(): void {
    router.openDialog(DialogType.SignIn)
  }

  /**
   * サインアウトを行います。
   */
  private async m_signOut(): Promise<void> {
    await this.$logic.auth.signOut()
  }

  /**
   * メールアドレス変更ダイアログを表示します。
   */
  private m_showEmailChangeDialog(): void {
    router.openDialog(DialogType.EmailChange)
  }

  /**
   * ユーザーアカウントを削除します。
   */
  private async m_deleteAccount(): Promise<void> {
    router.openDialog(DialogType.AccountDelete)
  }

  //----------------------------------------------------------------------
  //
  //  Event listeners
  //
  //----------------------------------------------------------------------

  private m_swOnStateChange(info: sw.StateChangeInfo) {
    this.m_swUpdateIsRequired = false

    if (info.state === sw.ChangeState.updated) {
      this.$q.notify({
        icon: 'info',
        position: 'bottom-left',
        message: info.message,
        actions: [
          {
            label: this.$t('reload'),
            color: 'white',
            handler: () => window.location.reload(),
          },
        ],
        timeout: 0,
      })
    } else if (info.state === sw.ChangeState.cached) {
      this.$q.notify({
        icon: 'info',
        position: 'bottom-left',
        message: info.message,
        timeout: 3000,
      })
    }

    if (info.state === sw.ChangeState.error) {
      console.error(info.message)
    } else {
      console.log('Service Worker:\n', info)
    }
  }

  private m_onComponentResize(e) {
    console.log('app-view:', e)
  }

  private m_dialogOnClosed() {
    router.closeDialog()
  }

  private m_signInMenuItemOnClick() {
    this.m_showSignInDialog()
  }

  private async m_signOutMenuItemOnClick() {
    await this.m_signOut()
  }

  private async m_changeEmailMenuItemOnClick() {
    await this.m_showEmailChangeDialog()
  }

  private async m_deleteAccountMenuItemOnClick() {
    await this.m_deleteAccount()
  }
}
</script>

<i18n>
en:
  reload: "Reload"
ja:
  reload: "再読み込み"
</i18n>
