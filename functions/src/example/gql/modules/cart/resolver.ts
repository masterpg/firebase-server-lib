import { AddCartItemInput, CartItem, CartServiceDI, EditCartItemResponse, UpdateCartItemInput } from '../../../services'
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import { IdToken, User, UserGuard } from '../../../../lib'
import { Inject, UseGuards } from '@nestjs/common'

@Resolver('CartItem')
@UseGuards(UserGuard)
export class CartResolver {
  constructor(@Inject(CartServiceDI.symbol) protected readonly cartService: CartServiceDI.type) {}

  @Query()
  async cartItems(@User() user: IdToken, @Args('ids') ids?: string[]): Promise<CartItem[]> {
    return this.cartService.findList(user, ids)
  }

  @Mutation()
  async updateCartItems(@User() user: IdToken, @Args('inputs') inputs: UpdateCartItemInput[]): Promise<EditCartItemResponse[]> {
    return this.cartService.updateList(user, inputs)
  }

  @Mutation()
  async addCartItems(@User() user: IdToken, @Args('inputs') inputs: AddCartItemInput[]): Promise<EditCartItemResponse[]> {
    return this.cartService.addList(user, inputs)
  }

  @Mutation()
  async removeCartItems(@User() user: IdToken, @Args('ids') ids: string[]): Promise<EditCartItemResponse[]> {
    return this.cartService.removeList(user, ids)
  }

  @Mutation()
  async checkoutCart(@User() user: IdToken): Promise<boolean> {
    return this.cartService.checkoutCart(user)
  }
}
