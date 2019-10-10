import { BreakpointMixin } from '@/components/breakpoint-mixin'
import { Component } from 'vue-property-decorator'

/**
 * 親を持たないResizableMixinのリスト
 */
const ORPHANS = new Set<ResizableMixin>()

@Component
export class ResizableMixin extends BreakpointMixin {
  //----------------------------------------------------------------------
  //
  //  Lifecycle hooks
  //
  //----------------------------------------------------------------------

  mounted() {
    this.$el.addEventListener('iron-request-resize-notifications', this.ResizableMixin_onIronRequestResizeNotifications)
    this.ResizableMixin_isAttached = true
    this.ResizableMixin_requestResizeNotifications()
  }

  destroyed() {
    this.ResizableMixin_isAttached = false

    if (this.ResizableMixin_parentResizable) {
      this.ResizableMixin_parentResizable.stopResizeNotificationsFor(this)
    } else {
      ORPHANS.delete(this)
      window.removeEventListener('resize', this.notifyResize)
    }

    this.ResizableMixin_parentResizable = null
  }

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  /**
   * 自身のコンポーネントがアタッチされているかを示すフラグ
   */
  private ResizableMixin_isAttached: boolean = false

  /**
   * 子孫へのリサイズ通知が実行されているかを示すフラグ
   */
  private ResizableMixin_notifyingDescendant: boolean = false

  /**
   * 自身からみて子孫となるResizableMixinのリスト
   */
  private ResizableMixin_interestedResizables: ResizableMixin[] = []

  private ResizableMixin_parentResizableValue: ResizableMixin | null = null

  private get ResizableMixin_parentResizable(): ResizableMixin | null {
    return this.ResizableMixin_parentResizableValue
  }

  private set ResizableMixin_parentResizable(value: ResizableMixin | null) {
    if (this.ResizableMixin_parentResizableValue === value) return
    this.ResizableMixin_parentResizableValue = value
    if (this.ResizableMixin_parentResizableValue) {
      window.removeEventListener('resize', this.notifyResize)
    }
  }

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  /**
   * Resizableなコンポーネントにリサイズ通知を行います。
   */
  notifyResize(): void {
    if (!this.ResizableMixin_isAttached) {
      return
    }

    this.ResizableMixin_interestedResizables.forEach(resizable => {
      if (this.resizerShouldNotify(resizable)) {
        this.ResizableMixin_notifyDescendant(resizable)
      }
    })

    this.BreakpointMixin_windowOnResize()

    this.ResizableMixin_fireResize()
  }

  /**
   * 自身と最も近いResizableな祖先との関連付けを行います。
   * @param parentResizable
   */
  assignParentResizable(parentResizable?: ResizableMixin): void {
    // 既に親が存在する場合、今の親から自分との関連を削除
    if (this.ResizableMixin_parentResizable) {
      this.ResizableMixin_parentResizable.stopResizeNotificationsFor(this)
    }

    // 新たな親と自分との関連を設定
    this.ResizableMixin_parentResizable = parentResizable as ResizableMixin
    if (this.ResizableMixin_parentResizable && this.ResizableMixin_parentResizable.ResizableMixin_interestedResizables.indexOf(this) === -1) {
      this.ResizableMixin_parentResizable.ResizableMixin_interestedResizables.push(this)
      this.ResizableMixin_parentResizable.ResizableMixin_subscribeIronResize(this)
    }
  }

  /**
   * 自身から指定された子孫を削除し、
   * その子孫に登録されている自身のcomponent-resizeリスナを解除します。
   * @param target
   */
  stopResizeNotificationsFor(target: ResizableMixin): void {
    const index = this.ResizableMixin_interestedResizables.indexOf(target)
    if (index > -1) {
      this.ResizableMixin_interestedResizables.splice(index, 1)
      this.ResizableMixin_unsubscribeIronResize(target)
    }
  }

  /**
   * このメソッドはリサイズ通知を受け取るかを制御するために使用されます。
   * リサイズ通知の受け取りを制御したいコンポーネントはこのメソッドをオーバーライドして下さい。
   * trueを返すとtargetの子孫にリサイズ通知が行われます。
   * falseを返すとtargetの子孫にはリサイズ通知が行われません。
   * @param target リサイズ通知の受け取りの制御対象コンポーネントが渡されます。
   */
  resizerShouldNotify(target: ResizableMixin): boolean {
    return true
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  /**
   * 自身からみて祖先のResizableMixinとの関連付けを要求/実行します。
   */
  private ResizableMixin_requestResizeNotifications(): void {
    if (!this.ResizableMixin_isAttached) return

    if (document.readyState === 'loading') {
      const requestResizeNotifications = this.ResizableMixin_requestResizeNotifications.bind(this)
      document.addEventListener('readystatechange', function readystatechanged() {
        document.removeEventListener('readystatechange', readystatechanged)
        requestResizeNotifications()
      })
    } else {
      this.ResizableMixin_findParent()

      if (!this.ResizableMixin_parentResizable) {
        // If this resizable is an orphan, tell other orphans to try to find
        // their parent again, in case it's this resizable.
        ORPHANS.forEach(orphan => {
          if (orphan !== this) {
            orphan.ResizableMixin_findParent()
          }
        })

        window.addEventListener('resize', this.notifyResize)
        this.notifyResize()
      } else {
        // If this resizable has a parent, tell other child resizables of
        // that parent to try finding their parent again, in case it's this
        // resizable.
        this.ResizableMixin_parentResizable.ResizableMixin_interestedResizables.forEach(resizable => {
          if (resizable !== this) {
            resizable.ResizableMixin_findParent()
          }
        })
      }
    }
  }

  /**
   * 自身からみて最も近い祖先のResizableMixinを検索し、自身と祖先の関連付けを行います。
   */
  private ResizableMixin_findParent(): void {
    this.assignParentResizable(undefined)

    // 自身と祖先の関連付けを要求するイベントを発火
    this.$el.dispatchEvent(
      new CustomEvent('iron-request-resize-notifications', {
        detail: { component: this },
        bubbles: true,
        cancelable: true,
        composed: true,
      })
    )

    if (!this.ResizableMixin_parentResizable) {
      ORPHANS.add(this)
    } else {
      ORPHANS.delete(this)
    }
  }

  /**
   * 指定されたdescendantの子孫に対して再帰的にリサイズ通知を行います。
   * @param descendant
   */
  private ResizableMixin_notifyDescendant(descendant: ResizableMixin): void {
    // NOTE(cdata): In IE10, attached is fired on children first, so it's
    // important not to notify them if the parent is not attached yet (or
    // else they will get redundantly notified when the parent attaches).
    if (!this.ResizableMixin_isAttached) {
      return
    }

    this.ResizableMixin_notifyingDescendant = true
    descendant.notifyResize()
    this.ResizableMixin_notifyingDescendant = false
  }

  /**
   * component-resizeイベントを発火します。
   */
  ResizableMixin_fireResize(): void {
    this.$el.dispatchEvent(new CustomEvent('component-resize', { bubbles: true, composed: true }))
  }

  /**
   * target上のcomponent-resizeイベントに自身のリスナを登録します。
   * @param target
   */
  private ResizableMixin_subscribeIronResize(target: ResizableMixin): void {
    target.$el.addEventListener('component-resize', this.ResizableMixin_onDescendantIronResize)
  }

  /**
   * target上のcomponent-resizeイベントに登録されている自身のリスナを解除します。
   * @param target
   */
  private ResizableMixin_unsubscribeIronResize(target: ResizableMixin): void {
    target.$el.removeEventListener('component-resize', this.ResizableMixin_onDescendantIronResize)
  }

  //----------------------------------------------------------------------
  //
  //  Event listeners
  //
  //----------------------------------------------------------------------

  /**
   * iron-request-resize-notificationsイベントのリスナです。
   * このイベントは、子孫が祖先との関連付けを必要とした場合発火されます。
   * @param e
   */
  private ResizableMixin_onIronRequestResizeNotifications(e): void {
    const child = (e as CustomEvent<{ component: ResizableMixin }>).detail.component
    if (child === this) {
      return
    }

    // 自分(親)と子(イベントターゲット)を関連付ける
    child.assignParentResizable(this)
    // 自分(親)から子(イベントターゲット)の子孫に対してリサイズを通知
    this.ResizableMixin_notifyDescendant(child)

    e.stopPropagation()
  }

  /**
   * component-resizeイベントのリスナです。
   * @param event
   */
  private ResizableMixin_onDescendantIronResize(event) {
    // 子孫へのリサイズ通知が行われている場合、リサイズイベントはここでストップする
    // (逆に子孫から祖先への通知はストップしてはならない)
    if (this.ResizableMixin_notifyingDescendant) {
      event.stopPropagation()
      return
    }
  }
}
