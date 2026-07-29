import { Controller, Get, Patch, Body, Req, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get user dashboard summary' })
  dashboard(@Req() req: any) { return this.svc.getDashboardSummary(req.user.id); }

  @Get('profile')
  getProfile(@Req() req: any) { return this.svc.findById(req.user.id); }

  @Patch('profile')
  @ApiOperation({ summary: 'Update user profile' })
  updateProfile(@Req() req: any, @Body() body: any) { return this.svc.updateProfile(req.user.id, body); }

  @Get('notifications')
  getNotifications(@Req() req: any) { return this.svc.getNotifications(req.user.id); }

  @Patch('notifications/:id/read')
  markRead(@Req() req: any, @Param('id') id: string) { return this.svc.markNotificationRead(req.user.id, id); }
}
