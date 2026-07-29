import { Controller, Post, Get, Body, Req, Query, UseGuards, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiService } from './ai.service';
import { ChatDto } from './dto/chat.dto';

@ApiTags('AI Assistant')
@Controller('ai')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Send message to AI Tax Assistant (Gemini + OpenAI + Rule-based)' })
  async chat(@Req() req: any, @Body() dto: ChatDto) {
    return this.aiService.chat(req.user.id, dto);
  }

  @Post('tax-plan')
  @ApiOperation({ summary: 'Get AI-powered personalised tax plan' })
  async getTaxPlan(@Req() req: any, @Body() body: { income: number; deductions: any }) {
    return this.aiService.getTaxPlan(req.user.id, body.income, body.deductions);
  }

  @Post('recommend-form')
  @ApiOperation({ summary: 'AI recommends which ITR form to file' })
  async recommendForm(@Req() req: any, @Body() profile: any) {
    return this.aiService.recommendITRForm(profile);
  }

  @Post('explain-notice')
  @ApiOperation({ summary: 'AI explains IT notice in simple language' })
  async explainNotice(
    @Req() req: any,
    @Body() body: { noticeText: string; section: string },
  ) {
    return this.aiService.explainNotice(req.user.id, body.noticeText, body.section);
  }

  @Get('chat-history')
  @ApiOperation({ summary: 'Get AI chat history for user' })
  async getChatHistory(@Req() req: any, @Query('sessionId') sessionId?: string) {
    return this.aiService.getChatHistory(req.user.id, sessionId);
  }
}
