import OpenAI from "openai";
import * as dotenv from 'dotenv';
import { ILLMClient, ChatMessage } from "./ILLMClient";
import { OPENAI_API_KEY_ENV_VAR, DEFAULT_MODEL_NAME } from "./llmConstants";
import { dbg } from "../utils";

// Load environment variables
dotenv.config({debug: true});

/**
 * OpenAIClient implements the ILLMClient interface to provide chat completion functionality
 * using OpenAI's API. It handles API authentication, base URL configuration, and message formatting.
 */
export class OpenAIClient implements ILLMClient {
    /** OpenAI client instance for making API calls */
    private openai: OpenAI;
    /** API key for authenticating with OpenAI */
    private apiKey: string;

    /**
     * Initializes a new OpenAIClient instance.
     * Sets up the OpenAI client with API key and optional base URL from environment variables.
     * @throws Error if OpenAI API key is not set in environment variables
     */
    constructor() {
        this.apiKey = process.env[OPENAI_API_KEY_ENV_VAR] || '';

        dbg(`ENV: ${JSON.stringify(process.env[OPENAI_API_KEY_ENV_VAR])}`);

        if (!this.apiKey) {
            const errorMessage = `OpenAI API key (${OPENAI_API_KEY_ENV_VAR}) is not set in environment variables.`;
            console.warn(errorMessage);
            throw new Error(errorMessage);
        }

        let baseURL = process.env['BASE_URL'] || '';
        if (!baseURL) {
            console.warn('BASE_URL is not set in environment variables. Using default OpenAI URL.');
            this.openai = new OpenAI({ apiKey: this.apiKey });
        }
        else {
            console.log(`Using base URL: ${baseURL}`);
            this.openai = new OpenAI({ apiKey: this.apiKey, baseURL: baseURL });
        }
    }

    /**
     * Makes a chat completion request to OpenAI's API.
     * @param history - Array of previous chat messages
     * @param prompt - The current user prompt to send
     * @param options - Optional parameters including model name override
     * @returns Promise resolving to the AI's response text
     * @throws Error if API call fails or returns empty content
     */
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