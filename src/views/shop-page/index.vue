<style lang="stylus" scoped>
@import '../../styles/app.variables.styl'

.title-text {
  @extend $text-h6
}

.product-item,
.cart-item {
  padding: 12px

  .title {
    @extend $text-subtitle1
  }

  .detail {
    @extend $text-body2
    color: $text-secondary-color
  }
}

.error-text {
  @extend $text-body2
  color: $text-error-color
}
</style>

<template>
  <div class="layout vertical" :class="{ 'app-ma-48': screenSize.pc, 'app-ma-24': screenSize.tab, 'app-ma-12': screenSize.sp }">
    <div>
      <div class="layout horizontal center">
        <div class="title-text">{{ $t('products') }}</div>
      </div>
      <hr style="width: 100%;" />
      <div v-for="product in $logic.shop.products" :key="product.id" class="layout horizontal center product-item">
        <div class="layout vertical center-justified">
          <div class="title">{{ product.title }}</div>
          <div class="detail">
            <span>{{ $t('price') }}</span> &mdash; {{ product.price | currency }},&nbsp; <span>{{ $t('stock') }}</span> &mdash;
            {{ product.stock }}
          </div>
        </div>
        <div class="flex"></div>
        <q-btn round color="primary" size="xs" icon="add" @click="m_addButtonOnClick(product)" />
      </div>
    </div>

    <div class="app-mt-20">
      <div class="layout horizontal center">
        <div class="title-text">{{ $t('yourCurt') }}</div>
        <div class="flex"></div>
      </div>
      <hr style="width: 100%;" />
      <div v-for="cartItem in $logic.shop.cartItems" :key="cartItem.id" class="layout horizontal center cart-item">
        <div class="layout vertical center-justified">
          <div class="title">{{ cartItem.title }}</div>
          <div class="detail">
            <span>{{ $t('price') }}</span> &mdash; {{ cartItem.price | currency }} x {{ cartItem.quantity }}
          </div>
        </div>
        <div class="flex"></div>
        <q-btn round color="primary" size="xs" icon="remove" @click="m_removeButtonOnClick(cartItem)" />
      </div>
      <div class="layout horizontal center app-mt-12">
        <div class="flex error-text">{{ m_checkoutStatus.message }}</div>
        <q-btn v-show="!m_cartIsEmpty" :label="$t('checkout')" color="primary" @click="m_checkoutButtonOnClick" />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { BaseComponent, ResizableMixin } from '@/components'
import { CartItem, CheckoutStatus, Product } from '@/store'
import { Component } from 'vue-property-decorator'
import { mixins } from 'vue-class-component'

@Component({ name: 'shop-page' })
export default class ShopPage extends mixins(BaseComponent, ResizableMixin) {
  //----------------------------------------------------------------------
  //
  //  Lifecycle hooks
  //
  //----------------------------------------------------------------------

  created() {}

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  private get m_cartIsEmpty(): boolean {
    return this.$logic.shop.cartItems.length === 0
  }

  private get m_checkoutStatus(): { result: boolean; message: string } {
    const checkoutStatus = this.$logic.shop.checkoutStatus
    const result = checkoutStatus === CheckoutStatus.None || checkoutStatus === CheckoutStatus.Successful
    return {
      result,
      message: result ? '' : 'Checkout failed.',
    }
  }

  //----------------------------------------------------------------------
  //
  //  Event listeners
  //
  //----------------------------------------------------------------------

  private async m_addButtonOnClick(product: Product) {
    this.$q.loading.show()
    await this.$logic.shop.addItemToCart(product.id)
    this.$q.loading.hide()
  }

  private async m_removeButtonOnClick(cartItem: CartItem) {
    this.$q.loading.show()
    await this.$logic.shop.removeItemFromCart(cartItem.productId)
    this.$q.loading.hide()
  }

  private async m_checkoutButtonOnClick() {
    this.$q.loading.show()
    await this.$logic.shop.checkout()
    this.$q.loading.hide()
  }
}
</script>

<i18n>
en:
  products: "Products"
  yourCurt: "Your Curt"
  price: "Price"
  stock: "Stock"
  checkout: "Checkout"
ja:
  products: "商品一覧"
  yourCurt: "あなたのカート"
  price: "価格"
  stock: "在庫"
  checkout: "チェックアウト"
</i18n>
