import { IsNumber, IsString, IsOptional, IsEnum, IsObject, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCalculationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() assessmentYear?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() entityType?: string;

  @ApiProperty({ example: 1200000 })
  @IsNumber() @Min(0)
  grossIncome: number;

  @ApiProperty({ enum: ['OLD','NEW'] })
  @IsEnum(['OLD','NEW'])
  regime: 'OLD' | 'NEW';

  @ApiPropertyOptional({ enum: ['below60','60to80','above80'] })
  @IsOptional() @IsEnum(['below60','60to80','above80'])
  age?: 'below60' | '60to80' | 'above80';

  @ApiPropertyOptional()
  @IsOptional() @IsObject()
  deductions?: {
    d80C?: number; d80CCD?: number; d80D?: number;
    d80E?: number; d80G?: number; d80TTA?: number;
    hra?: number; homeLoan?: number; other?: number;
  };

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) tdsDeducted?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) advanceTaxPaid?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsObject()
  capitalGains?: {
    stcgEquity?: number; ltcgEquity?: number;
    stcgOther?: number;  ltcgOther?: number;
  };
}
