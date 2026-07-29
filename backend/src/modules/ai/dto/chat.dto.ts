import { IsString, IsOptional, IsArray, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatDto {
  @ApiProperty({ example: 'ITR-1 kaise file karein?', maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional({ example: 'hi', enum: ['hi', 'en', 'mr'] })
  @IsOptional()
  @IsString()
  language?: string = 'hi';

  @ApiPropertyOptional({ example: 'general', enum: ['general', 'itr', 'gst', 'notice', 'invest', 'planner'] })
  @IsOptional()
  @IsString()
  mode?: string = 'general';

  @ApiPropertyOptional({ description: 'Session ID for conversation continuity' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ description: 'Previous messages for context' })
  @IsOptional()
  @IsArray()
  history?: Array<{ role: string; content: string }>;
}
