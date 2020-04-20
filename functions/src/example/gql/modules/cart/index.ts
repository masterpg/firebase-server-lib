import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import { AuthGuard, IdToken, User } from '../../../../lib'
import { CartItem, CartItemAddInput, CartItemEditResponse, CartItemUpdateInput, CartServiceDI } from '../../../services'
import { Inject, UseGuards } from '@nestjs/common'
import { Module } from '@nestjs/common'

@Resolver('CartItem')
@UseGuards(AuthGuard)
export class CartResolver {
  constructor(@Inject(CartServiceDI.symbol) protected readonly cartService: CartServiceDI.type) {}

  @Query()
  async cartItems(@User() user: IdToken, @Args('ids') ids?: string[]): Promise<CartItem[]> {
    return this.cartService.findList(user, ids)
  }

  @Mutation()
  async updateCartItems(@User() user: IdToken, @Args('inputs') inputs: CartItemUpdateInput[]): Promise<CartItemEditResponse[]> {
    return this.cartService.updateList(user, inputs)
  }

  @Mutation()
  async addCartItems(@User() user: IdToken, @Args('inputs') inputs: CartItemAddInput[]): Promise<CartItemEditResponse[]> {
    return this.cartService.addList(user, inputs)
  }

  @Mutation()
  async removeCartItems(@User() user: IdToken, @Args('ids') ids: string[]): Promise<CartItemEditResponse[]> {
    return this.cartService.removeList(user, ids)
  }

  @Mutation()
  async checkoutCart(@User() user: IdToken): Promise<boolean> {
    return this.cartService.checkoutCart(user)
  }
}

@Module({
  providers: [CartResolver],
})
export class GQLCartModule {}
