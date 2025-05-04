import OpenAI from "openai";
import * as dotenv from 'dotenv';
import { ILLMClient, ChatMessage } from "./ILLMClient";
import { OPENAI_API_KEY_ENV_VAR, DEFAULT_MODEL_NAME } from "./llmConstants";
import { dbg } from "../utils";

// Load environment variables
dotenv.config();

export class OpenAIClient implements ILLMClient {
    private openai: OpenAI;
    private apiKey: string;

    constructor() {
        this.apiKey = process.env[OPENAI_API_KEY_ENV_VAR] || '';
        if (!this.apiKey) {
            const errorMessage = `OpenAI API key (${OPENAI_API_KEY_ENV_VAR}) is not set in environment variables.`;
            console.warn(errorMessage);
            throw new Error(errorMessage);
        }
        this.openai = new OpenAI({ apiKey: this.apiKey });
    }

    async chatCompletion(
        history: ChatMessage[],
        prompt: string,
        options?: { modelName?: string }
    ): Promise<string> {
        
        // Combine history with the current prompt as the last user message
        // Ensure roles are compatible with OpenAI API ('user' or 'assistant')
        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            // Map history, ensuring correct role types
            ...history.map((msg): OpenAI.Chat.ChatCompletionMessageParam => {
                if (msg.role === 'user') {
                    return { role: 'user', content: msg.content };
                } else {
                    // Assume anything else was mapped to assistant
                    return { role: 'assistant', content: msg.content }; 
                }
            }),
            // Add the current prompt as a user message
            { role: 'user', content: prompt }
        ];

        try {
            // Determine effective model, using default if not provided
            const effectiveModel = options?.modelName && options.modelName.trim() !== '' 
                ? options.modelName 
                : DEFAULT_MODEL_NAME;
                
            dbg('\n--- Calling OpenAI API --- (via OpenAIClient)');
            dbg(`Using model for API call: ${effectiveModel}`);
            
            const completion = await this.openai.chat.completions.create({
                model: effectiveModel,
                messages: messages,
                temperature: 0.7, 
                max_tokens: 1500, 
            });
            dbg('--- OpenAI API Call Complete --- (via OpenAIClient)');

            const responseContent = completion.choices[0]?.message?.content;

            if (!responseContent) {
                console.warn("OpenAI API call returned successfully but contained no content.");
                throw new Error("OpenAI API call returned successfully but contained no content.");
            }

            return responseContent;
        } catch (error: any) {
            console.error("Error calling OpenAI API via OpenAIClient:", error);
            throw new Error(`Failed to communicate with OpenAI: ${error.message}`);
        }
    }
} 