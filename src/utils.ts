import * as uuid from 'uuid'; 
import { PromptService } from './services/PromptService';
import { RunnableConfig } from '@langchain/core/runnables';

export interface AppGraphConfigurable  {
    thread_id: string;
    promptService?: PromptService;
}

export interface AppRunnableConfig extends RunnableConfig {
    configurable: AppGraphConfigurable;
}

export function dbg(s: string) {
    console.debug(s);
}

export function say(s: string) {
    console.log(s);
}

export function newGraphConfig(): AppRunnableConfig {
    const thread_id = uuid.v4();
    const configurable: AppGraphConfigurable = { thread_id };
    return { configurable };
}