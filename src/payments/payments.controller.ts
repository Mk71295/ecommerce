import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { Role } from '../common/enums/role.enum.js';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { PaymentsService } from './payments.service.js';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  pay(@CurrentUser() user: JwtPayload, @Body() dto: CreatePaymentDto) {
    return this.payments.pay(user, dto);
  }

  @Get()
  findMine(@CurrentUser() user: JwtPayload, @Query() query: PaginationQueryDto) {
    return this.payments.findMine(user.sub, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseObjectIdPipe) id: string) {
    return this.payments.findOneFor(id, user);
  }

  @Post(':id/confirm')
  @Roles(Role.Admin)
  confirmCod(@Param('id', ParseObjectIdPipe) id: string) {
    return this.payments.confirmCod(id);
  }

  @Post(':id/refund')
  @Roles(Role.Admin)
  refund(@Param('id', ParseObjectIdPipe) id: string) {
    return this.payments.refund(id);
  }
}
