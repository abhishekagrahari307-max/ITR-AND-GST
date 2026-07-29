import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAIProvider } from './providers/openai.provider';
import { RuleBasedProvider } from './providers/rule-based.provider';
import { TaxKnowledgeBase } from './knowledge/tax-knowledge.base';

@Module({
  controllers: [AiController],
  providers: [
    AiService,
    GeminiProvider,
    OpenAIProvider,
    RuleBasedProvider,
    TaxKnowledgeBase,
  ],
  exports: [AiService],
})
export class AiModule {}
