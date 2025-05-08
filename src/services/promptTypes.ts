export interface PromptConfigEntry {
  inputs: string[];
  path: string;
}

export type AgentPromptsConfig = Record<string, PromptConfigEntry>;

export interface FullPromptsConfig {
  prompts: Record<string, AgentPromptsConfig>;
} 