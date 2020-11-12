import { AuthGuard, AuthServiceModule, IdToken, UserArg } from '../../../lib'
import { Body, Controller, Delete, Get, Inject, Module, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { CartItem, CartItemAddInput, CartItemEditResponse, CartItemUpdateInput, CartServiceDI, CartServiceModule } from '../../services'
import { BaseRESTModule } from '../base'

//========================================================================
//
//  Implementation
//
//========================================================================

@Controller('cartItems')
@UseGuards(AuthGuard)
class CartController {
  constructor(@Inject(CartServiceDI.symbol) protected readonly cartService: CartServiceDI.type) {}

  @Get()
  async findAll(@UserArg() user: IdToken, @Query('ids') ids?: string[]): Promise<CartItem[]> {
    return this.cartService.findList(user, ids)
  }

  @Put()
  async update(@UserArg() user: IdToken, @Body() inputs: CartItemUpdateInput[]): Promise<CartItemEditResponse[]> {
    return await this.cartService.updateList(user, inputs)
  }

  @Post()
  async addList(@UserArg() user: IdToken, @Body() inputs: CartItemAddInput[]): Promise<CartItemEditResponse[]> {
    return await this.cartService.addList(user, inputs)
  }

  @Delete()
  async removeList(@UserArg() user: IdToken, @Query('ids') ids: string[]): Promise<CartItemEditResponse[]> {
    return await this.cartService.removeList(user, ids)
  }

  @Put('checkout')
  async checkout(@UserArg() user: IdToken): Promise<boolean> {
    return await this.cartService.checkoutCart(user)
  }
}

@Module({
  controllers: [CartController],
  imports: [BaseRESTModule, CartServiceModule, AuthServiceModule],
})
class CartRESTModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export default CartRESTModule
