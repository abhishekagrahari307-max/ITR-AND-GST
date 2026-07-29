import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

@Injectable()
export class GeminiProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private genAI: GoogleGenerativeAI | null = null;
  private model: any;

  constructor(private readonly config: ConfigService) {
    const apiKey = config.get<string>('ai.geminiKey');
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        ],
        generationConfig: {
          maxOutputTokens: config.get('ai.maxTokens', 2000),
          temperature: config.get('ai.temperature', 0.7),
        },
      });
      this.logger.log('✅ Gemini AI initialised');
    }
  }

  async chat(message: string, systemPrompt: string, history: any[] = []): Promise<string> {
    if (!this.model) throw new Error('Gemini not initialised');

    const chat = this.model.startChat({
      history: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Understood. I will act as TaxMitra AI.' }] },
        ...history.map(h => ({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.content }],
        })),
      ],
    });

    const result = await chat.sendMessage(message);
    return result.response.text();
  }

  async analyze(prompt: string): Promise<string> {
    if (!this.model) throw new Error('Gemini not initialised');
    const result = await this.model.generateContent(prompt);
    return result.response.text();
  }
}
