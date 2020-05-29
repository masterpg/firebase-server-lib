import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import { AuthGuard, AuthGuardModule, IdToken, UserArg } from '../../../lib/nest'
import { CartItem, CartItemAddInput, CartItemEditResponse, CartItemUpdateInput, CartServiceDI, CartServiceModule } from '../../services'
import { Inject, UseGuards } from '@nestjs/common'
import { BaseGQLModule } from '../base'
import { Module } from '@nestjs/common'

//========================================================================
//
//  Implementation
//
//========================================================================

@Resolver('CartItem')
@UseGuards(AuthGuard)
class CartResolver {
  constructor(@Inject(CartServiceDI.symbol) protected readonly cartService: CartServiceDI.type) {}

  @Query()
  async cartItems(@UserArg() user: IdToken, @Args('ids') ids?: string[]): Promise<CartItem[]> {
    return this.cartService.findList(user, ids)
  }

  @Mutation()
  async updateCartItems(@UserArg() user: IdToken, @Args('inputs') inputs: CartItemUpdateInput[]): Promise<CartItemEditResponse[]> {
    return this.cartService.updateList(user, inputs)
  }

  @Mutation()
  async addCartItems(@UserArg() user: IdToken, @Args('inputs') inputs: CartItemAddInput[]): Promise<CartItemEditResponse[]> {
    return this.cartService.addList(user, inputs)
  }

  @Mutation()
  async removeCartItems(@UserArg() user: IdToken, @Args('ids') ids: string[]): Promise<CartItemEditResponse[]> {
    return this.cartService.removeList(user, ids)
  }

  @Mutation()
  async checkoutCart(@UserArg() user: IdToken): Promise<boolean> {
    return this.cartService.checkoutCart(user)
  }
}

@Module({
  providers: [CartResolver],
  imports: [BaseGQLModule, CartServiceModule, AuthGuardModule],
})
class CartGQLModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export default CartGQLModule
