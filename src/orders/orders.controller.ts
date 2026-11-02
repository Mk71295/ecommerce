import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { ListOrdersQueryDto, UpdateOrderStatusDto } from './dto/order-queries.dto.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Checkout the current cart. */
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateOrderDto) {
    return this.orders.createFromCart(user.sub, dto);
  }

  @Get()
  findMine(@CurrentUser() user: JwtPayload, @Query() query: ListOrdersQueryDto) {
    return this.orders.findMine(user.sub, query);
  }

  // declared before ':id' so "all" isn't parsed as an id
  @Get('all')
  @Roles(Role.Admin)
  findAll(@Query() query: ListOrdersQueryDto) {
    return this.orders.findAll(query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseObjectIdPipe) id: string) {
    return this.orders.findOneFor(id, user);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: JwtPayload, @Param('id', ParseObjectIdPipe) id: string) {
    return this.orders.cancel(id, user);
  }

  @Patch(':id/status')
  @Roles(Role.Admin)
  updateStatus(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orders.updateStatus(id, dto.status);
  }
}
