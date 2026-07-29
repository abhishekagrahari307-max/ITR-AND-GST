import { Controller, Post, Get, Delete, Body, Req, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CalculationsService } from './calculations.service';
import { CreateCalculationDto } from './dto/create-calculation.dto';

@ApiTags('Tax Calculations')
@Controller('calculations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class CalculationsController {
  constructor(private readonly svc: CalculationsService) {}

  @Post('compute')
  @ApiOperation({ summary: 'Compute income tax (Computax-style engine) and save to DB' })
  async compute(@Req() req: any, @Body() dto: CreateCalculationDto) {
    return this.svc.computeAndSave(req.user.id, dto);
  }

  @Post('compare-regime')
  @ApiOperation({ summary: 'Compare Old vs New Tax Regime' })
  async compareRegime(@Body() body: { income: number; deductions: any }) {
    return this.svc.compareRegimes(body);
  }

  @Post('hra')        async calcHRA(@Body() b: any)         { return this.svc.computeHRA(b); }
  @Post('sip')        async calcSIP(@Body() b: any)         { return this.svc.computeSIP(b); }
  @Post('emi')        async calcEMI(@Body() b: any)         { return this.svc.computeEMI(b); }
  @Post('gratuity')   async calcGratuity(@Body() b: any)    { return this.svc.computeGratuity(b); }
  @Post('gst')        async calcGST(@Body() b: any)         { return this.svc.computeGST(b); }
  @Post('capital-gain') async calcCG(@Body() b: any)        { return this.svc.computeCapitalGain(b); }

  @Get()
  @ApiOperation({ summary: 'Get all saved calculations for user' })
  getAll(@Req() req: any) { return this.svc.getAll(req.user.id); }

  @Get(':id')
  getById(@Req() req: any, @Param('id') id: string) { return this.svc.getById(req.user.id, id); }

  @Delete(':id')
  delete(@Req() req: any, @Param('id') id: string) { return this.svc.delete(req.user.id, id); }
}
