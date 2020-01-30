import { AddCartItemInput, CartItem, CartServiceDI, EditCartItemResponse, UpdateCartItemInput } from '../../../services'
import { AuthGuard, IdToken, User } from '../../../../lib'
import { Body, Controller, Delete, Get, Inject, Module, Param, Post, Put, Query, UseGuards } from '@nestjs/common'

@Controller('rest/cartItems')
@UseGuards(AuthGuard)
export class CartController {
  constructor(@Inject(CartServiceDI.symbol) protected readonly cartService: CartServiceDI.type) {}

  @Get()
  async findAll(@User() user: IdToken): Promise<CartItem[]> {
    return this.cartService.findList(user)
  }

  @Get(':id')
  async findOne(@User() user: IdToken, @Param('id') id: string): Promise<CartItem | undefined> {
    const list = await this.cartService.findList(user, [id])
    return list.length ? list[0] : undefined
  }

  @Put()
  async update(@User() user: IdToken, @Body() inputs: UpdateCartItemInput[]): Promise<EditCartItemResponse[]> {
    return await this.cartService.updateList(user, inputs)
  }

  @Post()
  async addList(@User() user: IdToken, @Body() inputs: AddCartItemInput[]): Promise<EditCartItemResponse[]> {
    return await this.cartService.addList(user, inputs)
  }

  @Delete()
  async removeList(@User() user: IdToken, @Query('ids') ids: string[]): Promise<EditCartItemResponse[]> {
    return await this.cartService.removeList(user, ids)
  }

  @Put('checkout')
  async checkout(@User() user: IdToken): Promise<boolean> {
    return await this.cartService.checkoutCart(user)
  }
}

@Module({
  controllers: [CartController],
})
export class RESTCartModule {}
