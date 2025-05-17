import { Command } from 'commander';
import * as path from 'path';
import { MemoryService } from './memory/MemoryService';
import * as dotenv from 'dotenv';
import { DEFAULT_MODEL_NAME } from './agents/llmConstants';
import { dbg, say } from './utils';
import { runAnalysis } from './commands/analyze';
import { runAsk } from './commands/ask';
import { runBuildContext } from './commands/buildContext';
import { PromptService } from './services/PromptService';


const GENERAL_ERROR = 1;
const ANALYSIS_ERROR = 2;
const ASK_ERROR = 3;
const COMMAND_PARSING_ERROR = 4;
const UNHANDLED_ERROR = 5;
// Load environment variables from .env file
dotenv.config();

say("Archie Architecture Assistant Starting...");

const memoryService = new MemoryService(); // Instantiate MemoryService

async function main() {
  const program = new Command();

  // --- Global Options ---
  program
    .name('archie')
    .version('1.0.0')
    .description('Archie - AI Architecture Assistant (CLI Mode)')
    .option('-m, --model <model_name>', 'Global AI model to use')
    .option('--memory-file <path>', 'Global path to memory file', 'archie_memory.json')
    .option('--prompts-config <path>', 'Global path to a JSON file for custom prompt configurations');

  // Retrieve global options early (for use in command actions)
  program.parseOptions(process.argv);
  const globalOptions = program.opts();
  const memoryFilePath = path.resolve(globalOptions.memoryFile);
  const modelName = globalOptions.model;
  const promptsConfigPath = globalOptions.promptsConfig;

  dbg(`Using memory file: ${memoryFilePath}`);
  say(`Using model: ${modelName}`);
  if (promptsConfigPath) {
    dbg(`Using prompts configuration file: ${path.resolve(promptsConfigPath)}`);
  }

  // Instantiate PromptService
  const promptService = new PromptService(promptsConfigPath);

  // Load memory before parsing/executing commands
  await memoryService.loadMemory(memoryFilePath);

  // --- Define Commands ---

  // 'analyze' command
  program
    .command('analyze')
    .description('Run analysis on a given query and input files')
    .requiredOption('-q, --query <query>', 'The analysis query')
    .requiredOption('-i, --inputs <directory>', 'Input directory for analysis context')
    // Allow local override of global model and prompts config
    .option('-m, --model <model_name>', 'Specify the AI model to use for this analysis')
    .option('--prompts-config <path>', 'Path to a JSON file for custom prompt configurations for this analysis')
    .action(async (options) => {
      const globalOpts = program.opts();
      const effectiveModel = options.model || globalOpts.model || DEFAULT_MODEL_NAME;
      const effectivePromptsConfig = options.promptsConfig || globalOpts.promptsConfig;
      const localPromptService = effectivePromptsConfig ? new PromptService(effectivePromptsConfig) : promptService;

      try {
        dbg(`Running analysis with query: "${options.query}"`);
        dbg(`Input directory: ${options.inputs}`);
        await runAnalysis(options.query, options.inputs, effectiveModel, memoryService, localPromptService);
        dbg("Analysis command finished successfully.");
      } catch (error) {
        dbg(`Analysis command failed: ${error}`);
        process.exit(ANALYSIS_ERROR);
      }
    });

  // New build-context command
  program.command('build-context')
    .description('Build context for a system or feature from input files.')
    .requiredOption('-i, --inputs <directory>', 'Input directory containing files for context building')
    .requiredOption('-n, --name <system_name>', 'Name of the system or feature')
    // Allow local override of global model and prompts config
    .option('-m, --model <model_name>', 'Specify the AI model to use for this context build')
    .option('--prompts-config <path>', 'Path to a JSON file for custom prompt configurations for this context build')
    .action(async (options) => {
      const globalOpts = program.opts();
      const effectiveModel = options.model || globalOpts.model || DEFAULT_MODEL_NAME;
      const effectivePromptsConfig = options.promptsConfig || globalOpts.promptsConfig;
      const localPromptService = effectivePromptsConfig ? new PromptService(effectivePromptsConfig) : promptService;

      try {
        dbg(`Running context build for system: "${options.name}" with inputs from "${options.inputs}"`);
        await runBuildContext(options.name, options.inputs, effectiveModel, memoryService, localPromptService);
        dbg("Build-context command finished successfully.");
      } catch (error) {
        dbg(`Build-context command failed: ${error}`);
        process.exit(GENERAL_ERROR);
      }
    });

  // 'ask' command
  program
    .command('ask')
    .description('Interact with the default agent')
    .argument('<input...>', 'The text input/question for the agent')
    .action(async (inputParts) => { // receives array of positional arguments
      const inputText = inputParts.join(' ');
      const globalOpts = program.opts();
      try {
        dbg(`Sending to agent: "${inputText}"`);
        await runAsk(inputText, globalOpts.model || DEFAULT_MODEL_NAME, memoryService, promptService);
        dbg("Ask command finished successfully.");
      } catch (error) {
        dbg(`Ask command failed: ${error}`);
        process.exit(GENERAL_ERROR);
      }
    });

  // --- Parse and Execute ---
  try {
    // Parse arguments and execute the appropriate command action
    await program.parseAsync(process.argv);

    // Check if any command was actually run. If not (e.g., just --help), don't save.
    // Commander doesn't expose a simple flag for this, so we check if args imply a command.
    // const commandWasExecuted = program.args.length > 0 && program.args[0] !== 'help'; // Simple check
    const executedCommandName = program.args[0];
    const knownCommands = program.commands.map(cmd => cmd.name());

    if (knownCommands.includes(executedCommandName)) {
        // Save memory ONLY if a recognized command action was successfully completed
        dbg("Command execution finished. Saving memory...");
        await memoryService.saveMemory();
        dbg("Memory saved. Application shutting down.");
    } else if (program.args.length === 0 && process.argv.length <= 2) {
        // No command provided, show help
        program.help();
    } else {
        // Command might have been handled (like --version or --help), or was unknown.
        // If it wasn't one we defined actions for, don't save memory.
        say("No command executed or unknown command/option. Shutting down without saving memory.");
    }

  } catch (error) {
      // Catch errors during parsing itself (e.g., invalid options)
      dbg(`Error during command parsing or execution: ${error}`);
      process.exit(COMMAND_PARSING_ERROR);
  }

}

main().catch(error => {
  // Catch errors from the main async function itself (e.g., loading memory)
  dbg(`Unhandled application error: ${error}`);
  process.exit(UNHANDLED_ERROR);
}); 