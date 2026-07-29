import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class OpenAIProvider {
  private readonly logger = new Logger(OpenAIProvider.name);
  private client: OpenAI | null = null;

  constructor(private readonly config: ConfigService) {
    const apiKey = config.get<string>('ai.openaiKey');
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
      this.logger.log('✅ OpenAI initialised');
    }
  }

  async chat(message: string, systemPrompt: string, history: any[] = []): Promise<string> {
    if (!this.client) throw new Error('OpenAI not initialised');

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    const completion = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: this.config.get('ai.maxTokens', 2000),
      temperature: this.config.get('ai.temperature', 0.7),
    });

    return completion.choices[0]?.message?.content || 'Unable to generate response';
  }

  async analyze(prompt: string): Promise<string> {
    if (!this.client) throw new Error('OpenAI not initialised');
    const completion = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: this.config.get('ai.maxTokens', 2000),
    });
    return completion.choices[0]?.message?.content || '';
  }
}
