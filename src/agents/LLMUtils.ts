import OpenAI from "openai";
import * as dotenv from 'dotenv';
import { dbg } from "../cli/shell";

// Load environment variables
dotenv.config();

export const DEFAULT_MODEL = 'gpt-3.5-turbo';

/**
 * Calls the OpenAI Chat Completions API.
 * 
 * @param history The conversation history.
 * @param prompt The specific user prompt/instruction for this turn.
 * @param modelName Optional model name to override the default.
 * @returns The content of the LLM's response.
 * @throws Error if API key is missing, API call fails, or response is empty.
 */
export async function callOpenAI(
    // Use only roles compatible with AppState definition
    history: Array<{ role: "user" | "agent"; content: string }>, 
    prompt: string,
    modelName?: string
): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        console.warn("OpenAI API key (OPENAI_API_KEY) is not set in environment variables.");
        throw new Error("OpenAI API key (OPENAI_API_KEY) is not set in environment variables.");
    }

    const openai = new OpenAI({ apiKey });

    // Map internal roles to OpenAI roles ('agent' -> 'assistant')
    const mappedHistory = history.map(msg => ({
        // Ensure role is either 'user' or 'assistant' for the API call
        role: msg.role === 'agent' ? 'assistant' as const : 'user' as const,
        content: msg.content
    }));

    // Combine history with the current prompt as a user message
    // Explicitly type the array to satisfy OpenAI's expected types
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        ...mappedHistory,
        { role: 'user', content: prompt }
    ];

    try {
        // Determine effective model and log it
        const effectiveModel = modelName && modelName.trim() !== '' ? modelName : DEFAULT_MODEL;
        dbg('\n--- Calling OpenAI API ---');
        dbg(`Using model for API call: ${effectiveModel}`);
        
        const completion = await openai.chat.completions.create({
            model: effectiveModel,
            messages: messages,
            temperature: 0.7, 
            max_tokens: 1500, 
        });
        dbg('--- OpenAI API Call Complete ---');

        const responseContent = completion.choices[0]?.message?.content;

        if (!responseContent) {
            console.warn("OpenAI API call returned successfully but contained no content.");
            throw new Error("OpenAI API call returned successfully but contained no content.");
        }

        return responseContent;
    } catch (error: any) {
        console.error("Error calling OpenAI API:", error);
        // Rethrow a new error to avoid leaking too many details potentially
        throw new Error(`Failed to communicate with OpenAI: ${error.message}`);
    }
} 