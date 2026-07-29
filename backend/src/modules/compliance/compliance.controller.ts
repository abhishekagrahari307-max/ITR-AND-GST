import { Controller, Get, Post, Patch, Body, Req, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ComplianceService } from './compliance.service';

@ApiTags('Compliance')
@Controller('compliance')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class ComplianceController {
  constructor(private readonly svc: ComplianceService) {}

  @Get('dates')
  @ApiOperation({ summary: 'Get all compliance due dates (master calendar)' })
  getMasterDates(@Query('category') category?: string) { return this.svc.getMasterDates(category); }

  @Get('tasks')
  @ApiOperation({ summary: 'Get user personal compliance tasks' })
  getUserTasks(@Req() req: any) { return this.svc.getUserTasks(req.user.id); }

  @Post('tasks')
  @ApiOperation({ summary: 'Create a compliance task' })
  createTask(@Req() req: any, @Body() body: any) { return this.svc.createTask(req.user.id, body); }

  @Patch('tasks/:id/complete')
  @ApiOperation({ summary: 'Mark compliance task as complete' })
  complete(@Req() req: any, @Param('id') id: string) { return this.svc.markComplete(req.user.id, id); }

  @Post('reminders')
  @ApiOperation({ summary: 'Set AI compliance reminders (email + SMS)' })
  setReminders(@Req() req: any, @Body() body: { email: string; phone: string; daysBefore: number }) {
    return this.svc.setReminders(req.user.id, body.email, body.phone, body.daysBefore);
  }

  @Post('penalty')
  @ApiOperation({ summary: 'Calculate penalty for late filing' })
  calcPenalty(@Body() body: { type: string; taxAmount: number; daysDelayed: number }) {
    return this.svc.calculatePenalty(body.type, body.taxAmount, body.daysDelayed);
  }
}
