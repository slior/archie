import * as fs from 'fs';
import * as path from 'path';
import { app } from '../src/agents/graph';
// Removed incorrect type import

// Define File Path and Placeholders
const docFilePath = path.join(__dirname, '..', 'docs', 'agent_graph.md');
const startPlaceholder = '<!-- MERMAID_DIAGRAM_START -->';
const endPlaceholder = '<!-- MERMAID_DIAGRAM_END -->';

try {
    // Get Graph Structure
    const graphData = app.getGraph();

    // Temporarily log the structure to understand it
    console.log("Inspecting detailed graphData structure:");
    console.log(JSON.stringify(graphData, null, 2)); // Re-enable logging

    // --- Mermaid Generation Logic --- 
    let mermaidSyntax = 'graph TD;\n';

    // Define descriptive labels for nodes
    const nodeLabels: Record<string, string> = {
        '__start__': 'Start',
        '__end__': 'End'
    };

    // Add node definitions (Iterate over object entries, trusting linter type)
    Object.entries(graphData.nodes).forEach(([nodeId, nodeData]: [string, any]) => { 
        // Assume nodeId from the entry key is the correct ID.
        // Access type from nodeData (the value in the map).
        // const nodeType = nodeData?.type; // Type no longer needed

        // Determine label: Special case for start/end, otherwise use ID only
        // const typeString = nodeType ? `(${nodeType})` : '(unknown type)'; // Type no longer needed
        const label = nodeLabels[nodeId] || nodeId; // Use nodeId from key if not start/end
        mermaidSyntax += `    ${nodeId}([${label}]);\n`; // Use nodeId from key
    });

    // Add edge definitions (Assuming edges ARE an array based on previous inspection)
    // Use 'any' for edge type if Edge is not available
    graphData.edges.forEach((edge: any) => { 
        // Handle potentially undefined conditional, default to false
        const isConditional = edge.conditional ?? false; 
        const arrow = isConditional ? '-.->' : '-->';
        // Use generic conditional label
        const conditionLabel = isConditional ? '|conditional|' : ''; 
        mermaidSyntax += `    ${edge.source} ${arrow}${conditionLabel} ${edge.target};\n`;
    });

    const generatedMermaidSyntax = mermaidSyntax; // Assign the generated syntax

    // --- File Update Logic --- 
    console.log("\nGenerated Mermaid Syntax:\n", generatedMermaidSyntax);
    
    // Read the documentation file
    let fileContent = fs.readFileSync(docFilePath, 'utf-8');

    // Find placeholder indices
    const startIndex = fileContent.indexOf(startPlaceholder);
    const endIndex = fileContent.indexOf(endPlaceholder);

    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
        console.error(`Error: Could not find ${startPlaceholder} and/or ${endPlaceholder} markers in ${docFilePath}.`);
        process.exit(1);
    }

    // Construct the new content
    const preContent = fileContent.substring(0, startIndex + startPlaceholder.length);
    const postContent = fileContent.substring(endIndex);
    const newMermaidBlock = `\n\`\`\`mermaid\n${generatedMermaidSyntax}\`\`\`\n`;

    const newFileContent = preContent + newMermaidBlock + postContent;

    // Write the updated content back to the file
    fs.writeFileSync(docFilePath, newFileContent, 'utf-8');
    console.log(`Successfully updated Mermaid diagram in ${docFilePath}`);

} catch (error) {
    console.error("Error during script execution:", error);
    process.exit(1);
}

// console.log("Script finished Mermaid generation phase."); // Remove or change final log 