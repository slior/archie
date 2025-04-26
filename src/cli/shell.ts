import inquirer from 'inquirer';
import { MemoryService } from '../memory/MemoryService';
import { app as agentApp, AppState } from '../agents/graph';

export async function startShell(memoryService: MemoryService) {
  console.log('Starting interactive shell. Type "exit" to quit.');

  while (true) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'command',
        message: 'archie> ',
      },
    ]);

    const commandInput = answers.command.trim();

    if (commandInput.toLowerCase() === 'exit') {
      console.log('Saving memory before exiting...');
      await memoryService.saveMemory();
      console.log('Exiting Archie...');
      break; // Exit the loop
    } else if (commandInput === '') {
        continue; // Ignore empty input
    }

    // Handle non-exit commands by invoking the agent graph
    if (!agentApp) {
        console.log("Error: Agent graph is not compiled or available.");
        continue;
    }

    try {
        console.log(`Invoking agent graph with input: "${commandInput}"`);
        // Define the initial state for this invocation
        const initialState: AppState = {
            userInput: commandInput,
            response: "", // Start with an empty response
            // TODO: Add other necessary state parts like conversation history or memory references
        };

        // Invoke the graph
        const result = await agentApp.invoke(initialState);

        // Display the final response from the graph state
        console.log("Agent Response:", result.response); // Access the 'response' channel from the final state

    } catch (error) {
        console.error("Error during agent graph execution:", error);
    }
  }
} 