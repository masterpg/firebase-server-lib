import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql'
import { AuthGuard, UserArg } from '../../../nest'
import {
  AuthServiceModule,
  CartItem,
  CartItemAddInput,
  CartItemEditResponse,
  CartItemUpdateInput,
  ExampleShopServiceDI,
  ExampleShopServiceModule,
  IdToken,
  Product,
} from '../../../services'
import { Inject, UseGuards } from '@nestjs/common'
import { Module } from '@nestjs/common'

//========================================================================
//
//  Implementation
//
//========================================================================

@Resolver()
class ExampleShopResolver {
  constructor(@Inject(ExampleShopServiceDI.symbol) protected readonly shopService: ExampleShopServiceDI.type) {}

  @Query()
  async products(@Args('ids') ids?: string[]): Promise<Product[]> {
    return this.shopService.getProducts(ids)
  }

  @Query()
  @UseGuards(AuthGuard)
  async cartItems(@UserArg() user: IdToken, @Args('ids') ids?: string[]): Promise<CartItem[]> {
    return this.shopService.getCartItems(user, ids)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async addCartItems(@UserArg() user: IdToken, @Args('inputs') inputs: CartItemAddInput[]): Promise<CartItemEditResponse[]> {
    return this.shopService.addCartItems(user, inputs)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async updateCartItems(@UserArg() user: IdToken, @Args('inputs') inputs: CartItemUpdateInput[]): Promise<CartItemEditResponse[]> {
    return this.shopService.updateCartItems(user, inputs)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async removeCartItems(@UserArg() user: IdToken, @Args('ids') ids: string[]): Promise<CartItemEditResponse[]> {
    return this.shopService.removeCartItems(user, ids)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async checkoutCart(@UserArg() user: IdToken): Promise<boolean> {
    return this.shopService.checkoutCart(user)
  }
}

@Module({
  providers: [ExampleShopResolver],
  imports: [AuthServiceModule, ExampleShopServiceModule],
})
class ExampleShopGQLModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { ExampleShopGQLModule }
