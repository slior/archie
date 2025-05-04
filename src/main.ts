import { Command } from 'commander';
import * as path from 'path';
import { MemoryService } from './memory/MemoryService';
import * as dotenv from 'dotenv';
import { DEFAULT_MODEL } from './agents/LLMUtils';
import { dbg, say } from './utils';
// Import new command handlers
import { runAnalysis } from './commands/analyze';
import { runAsk } from './commands/ask';


const ANALYSIS_ERROR = 1;
const ASK_ERROR = 2;
const COMMAND_PARSING_ERROR = 3;
const UNHANDLED_ERROR = 4;
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
    .option('--memory-file <path>', 'Path to the memory JSON file', './memory.json')
    .option('--model <name>', 'Specify the OpenAI model to use', DEFAULT_MODEL)
    .enablePositionalOptions(); // Recommended when using subcommands with global options

  // Retrieve global options early (for use in command actions)
  program.parseOptions(process.argv);
  const globalOptions = program.opts();
  const memoryFilePath = path.resolve(globalOptions.memoryFile);
  const modelName = globalOptions.model;

  dbg(`Using memory file: ${memoryFilePath}`);
  say(`Using model: ${modelName}`);

  // Load memory before parsing/executing commands
  await memoryService.loadMemory(memoryFilePath);

  // --- Define Commands ---

  // 'analyze' command
  program
    .command('analyze')
    .description('Run analysis on specified files with a query')
    .requiredOption('-q, --query <query>', 'The analysis query')
    .requiredOption('-i, --inputs <directory>', 'Input directory for analysis context')
    .action(async (options) => { // receives local options object
      try {
        dbg(`Running analysis with query: "${options.query}"`);
        dbg(`Input directory: ${options.inputs}`);
        // Call handler with specific args + global modelName & memoryService
        await runAnalysis(options.query, options.inputs, modelName, memoryService);
        dbg("Analysis command finished successfully.");
      } catch (error) {
        dbg(`Analysis command failed: ${error}`);
        process.exit(ANALYSIS_ERROR); // Exit on command error
      }
    });

  // 'ask' command
  program
    .command('ask')
    .description('Interact with the default agent')
    .argument('<input...>', 'The text input/question for the agent')
    .action(async (inputParts) => { // receives array of positional arguments
      const inputText = inputParts.join(' ');
      try {
        dbg(`Sending to agent: "${inputText}"`);
        // Call handler with specific args + global modelName & memoryService
        await runAsk(inputText, modelName, memoryService);
        dbg("Ask command finished successfully.");
      } catch (error) {
        dbg(`Ask command failed: ${error}`);
        process.exit(ASK_ERROR); // Exit on command error
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