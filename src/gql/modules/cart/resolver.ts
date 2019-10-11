import { AddCartItemInput, CartItem, CartServiceDI, EditCartItemResponse, UpdateCartItemInput } from '../../../services/business'
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import { Inject, UseGuards } from '@nestjs/common'
import { IdToken } from '../../../services/base'
import { User } from '../../../nest'
import { UserGuard } from '../../../nest/guards/user'

@Resolver('CartItem')
export class CartResolver {
  constructor(@Inject(CartServiceDI.symbol) protected readonly cartService: CartServiceDI.type) {}

  @Query()
  @UseGuards(UserGuard)
  async cartItems(@User() user: IdToken, @Args('ids') ids?: string[]): Promise<CartItem[]> {
    return this.cartService.getCartItems(user, ids)
  }

  @Mutation()
  @UseGuards(UserGuard)
  async updateCartItems(@User() user: IdToken, @Args('inputs') inputs: UpdateCartItemInput[]): Promise<EditCartItemResponse[]> {
    return this.cartService.updateCartItems(user, inputs)
  }

  @Mutation()
  @UseGuards(UserGuard)
  async addCartItems(@User() user: IdToken, @Args('inputs') inputs: AddCartItemInput[]): Promise<EditCartItemResponse[]> {
    return this.cartService.addCartItems(user, inputs)
  }

  @Mutation()
  @UseGuards(UserGuard)
  async removeCartItems(@User() user: IdToken, @Args('ids') ids: string[]): Promise<EditCartItemResponse[]> {
    return this.cartService.removeCartItems(user, ids)
  }

  @Mutation()
  @UseGuards(UserGuard)
  async checkoutCart(@User() user: IdToken): Promise<boolean> {
    return this.cartService.checkoutCart(user)
  }
}
