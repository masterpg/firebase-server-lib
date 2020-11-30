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

@Resolver('ExampleShop')
class ExampleShopResolver {
  constructor(@Inject(ExampleShopServiceDI.symbol) protected readonly shopService: ExampleShopServiceDI.type) {}

  @Query(returns => [Product])
  async products(@Args('ids', { type: () => [ID] }) ids?: string[]): Promise<Product[]> {
    return this.shopService.getProducts(ids)
  }

  @Query(returns => [CartItem])
  @UseGuards(AuthGuard)
  async cartItems(@UserArg() user: IdToken, @Args('ids', { type: () => [ID] }) ids?: string[]): Promise<CartItem[]> {
    return this.shopService.getCartItems(user, ids)
  }

  @Mutation(returns => [CartItemEditResponse])
  @UseGuards(AuthGuard)
  async addCartItems(
    @UserArg() user: IdToken,
    @Args('inputs', { type: () => [CartItemAddInput] }) inputs: CartItemAddInput[]
  ): Promise<CartItemEditResponse[]> {
    return this.shopService.addCartItems(user, inputs)
  }

  @Mutation(returns => [CartItemEditResponse])
  @UseGuards(AuthGuard)
  async updateCartItems(
    @UserArg() user: IdToken,
    @Args('inputs', { type: () => [CartItemUpdateInput] }) inputs: CartItemUpdateInput[]
  ): Promise<CartItemEditResponse[]> {
    return this.shopService.updateCartItems(user, inputs)
  }

  @Mutation(returns => [CartItemEditResponse])
  @UseGuards(AuthGuard)
  async removeCartItems(@UserArg() user: IdToken, @Args('ids', { type: () => [ID] }) ids: string[]): Promise<CartItemEditResponse[]> {
    return this.shopService.removeCartItems(user, ids)
  }

  @Mutation(returns => Boolean)
  @UseGuards(AuthGuard)
  async checkout(@UserArg() user: IdToken): Promise<boolean> {
    return this.shopService.checkout(user)
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
