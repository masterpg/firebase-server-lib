<style lang="stylus" scoped>
.main {
  height: 100%
}

.sad-img {
  width: 30vw
  max-width: 150px
}

.back-button {
  width: 200px
}

.rest-box {
  width: 300px
}
</style>

<template>
  <div class="layout vertical center-center main">
    <img src="@/assets/icons/sad.svg" class="sad-img" />
    <div class="text-faded">Sorry, nothing here...<strong>(404)</strong></div>
    <q-btn color="primary" class="back-button" @click="m_backButtonOnClick()">Go back</q-btn>
    <div class="layout vertical center app-mt-20">
      <div class="layout vertical rest-box">
        <div>{{ m_getProductsPath }}</div>
        <div class="layout horizontal end-justified">
          <q-input v-model="m_productId" label="id" dense />
          <q-btn flat rounded dense color="primary" label="GET" @click="m_getProductsOnClick" />
        </div>
      </div>
      <div class="layout vertical rest-box app-mt-20">
        <div>{{ m_getCartItemsPath }}</div>
        <div class="layout horizontal end-justified">
          <q-input v-model="m_cartItemId" label="id" dense />
          <q-btn flat rounded dense color="primary" label="GET" @click="m_getCartItemsOnClick" />
        </div>
        <div class="layout horizontal end-justified">
          <q-input v-model.number="m_cartItemQuantity" type="number" label="quantity" dense />
          <q-btn flat rounded dense color="primary" label="PUT" @click="m_putCartItemsOnClick" />
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { BaseComponent } from '@/components'
import { Component } from 'vue-property-decorator'
import { mixins } from 'vue-class-component'
import { rest } from '@/rest'
import { router } from '@/base/router'

@Component({ name: 'error404-page' })
export default class Error404Page extends mixins(BaseComponent) {
  private get m_getProductsPath(): string {
    const path = '/api/products'
    return this.m_productId ? `${path}/${this.m_productId}` : path
  }

  private m_productId = ''

  get m_getCartItemsPath(): string {
    const path = '/api/cartItems'
    return this.m_cartItemId ? `${path}/${this.m_cartItemId}` : path
  }

  private m_cartItemId = 'cartItem1'

  private m_cartItemQuantity = 3

  private m_backButtonOnClick() {
    router.views.abcPage.move()
  }

  private async m_getProductsOnClick() {
    if (this.m_productId) {
      const product = await rest.getProduct(this.m_productId)
      console.log(product)
    } else {
      const products = await rest.getProducts()
      console.log(products)
    }
  }

  private async m_getCartItemsOnClick() {
    if (this.m_cartItemId) {
      const cartItem = await rest.getCartItem(this.m_cartItemId)
      console.log(cartItem)
    } else {
      const cartItems = await rest.getCartItems()
      console.log(cartItems)
    }
  }

  private async m_putCartItemsOnClick() {
    const cartItem = await rest.putCartItem(this.m_cartItemId, this.m_cartItemQuantity)
    console.log(cartItem)
  }
}
</script>
