import { Command } from 'commander';
import * as path from 'path';
import { startShell } from './cli/shell'; // Import the shell function
import { MemoryService } from './memory/MemoryService'; // Import MemoryService
import * as dotenv from 'dotenv'; // Import dotenv

// Load environment variables from .env file
dotenv.config();

console.log("Archie Architecture Assistant Starting...");

const memoryService = new MemoryService(); // Instantiate MemoryService

async function main() {
  const program = new Command();

  program
    .version('1.0.0') // Example version
    .description('Archie - AI Architecture Assistant')
    .option('--memory-file <path>', 'Path to the memory JSON file', './memory.json');
    // TODO: Add options for API keys if needed, although .env is preferred

  program.parse(process.argv);

  const options = program.opts();
  const memoryFilePath = path.resolve(options.memoryFile);

  console.log(`Using memory file: ${memoryFilePath}`);

  // Load memory using the service instance
  await memoryService.loadMemory(memoryFilePath);

  // Start the interactive shell, passing the memory service instance
  await startShell(memoryService);

  // Save is now handled within the shell's exit command
  console.log("Shell exited. Application shutting down.");
}

main().catch(error => {
  console.error("Application error:", error);
  process.exit(1);
}); 