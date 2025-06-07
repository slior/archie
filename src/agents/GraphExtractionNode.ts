import { RunnableConfig } from "@langchain/core/runnables";
import { Document } from "@langchain/core/documents";
import { ChatOpenAI } from "@langchain/openai";
import { LLMGraphTransformer } from "@langchain/community/experimental/graph_transformers/llm";

import { AppState } from "./graph";
import { Entity, Relationship } from "../memory/memory_types";
import { MemoryService } from "../memory/MemoryService";
import { DEFAULT_MODEL_NAME, OPENAI_API_KEY_ENV_VAR, OPENAI_BASE_URL_ENV_VAR } from "./llmConstants";
import { AppGraphConfigurable, dbg, say } from "../utils";

/**
 * Normalizes entity names to avoid duplicates with different casing/spacing.
 * @param name - The entity name to normalize
 * @returns Normalized entity name (lowercase, trimmed)
 */
function normalizeEntityName(name: string): string {
    return name.toLowerCase().trim();
}

// Type definitions for dependency injection
type ChatOpenAIConstructor = typeof ChatOpenAI;
type LLMGraphTransformerConstructor = typeof LLMGraphTransformer;

/**
 * GraphExtractionNode extracts knowledge graphs from documents using LLMGraphTransformer.
 * 
 * This node:
 * - Takes document inputs from DocumentRetrievalNode
 * - Uses LangChain's LLMGraphTransformer to extract entities and relationships
 * - Maps the extracted data to Archie's Entity and Relationship types
 * - Updates the MemoryService with the extracted knowledge
 * - Handles errors gracefully without failing the overall flow
 * 
 * @param state - Current AppState containing inputs and configuration
 * @param config - LangGraph configuration including MemoryService
 * @param ChatOpenAIClass - ChatOpenAI constructor (for dependency injection)
 * @param LLMGraphTransformerClass - LLMGraphTransformer constructor (for dependency injection)
 * @returns Updated AppState with knowledge graph data integrated into memory
 */
export async function graphExtractionNode(
    state: AppState,
    config?: RunnableConfig,
    ChatOpenAIClass: ChatOpenAIConstructor = ChatOpenAI,
    LLMGraphTransformerClass: LLMGraphTransformerConstructor = LLMGraphTransformer
): Promise<Partial<AppState>> {
    dbg("--- Graph Extraction Node Starting ---");
    
    try {
        // Step 7: Implement LLM configuration using Archie's system
        
        // Read API key from environment (same as Archie's OpenAIClient)
        const apiKey = process.env[OPENAI_API_KEY_ENV_VAR];
        if (!apiKey) {
            throw new Error(`OpenAI API key (${OPENAI_API_KEY_ENV_VAR}) is not set in environment variables.`);
        }

        // Get model name from state (set by CLI --model option) or use default
        const modelName = state.modelName || DEFAULT_MODEL_NAME;
        dbg(`Using model for graph extraction: ${modelName}`);

        // Configure ChatOpenAI using Archie's settings
        const chatModelConfig: any = {
            modelName: modelName,
            openAIApiKey: apiKey,
            temperature: 0.7,
            maxTokens: 1500
        };

        // Add base URL if configured (for proxy/self-hosted instances)
        const baseURL = process.env[OPENAI_BASE_URL_ENV_VAR];
        if (baseURL) {
            dbg(`Using custom base URL: ${baseURL}`);
            chatModelConfig.configuration = {
                baseURL: baseURL
            };
        }

        const chatModel = new ChatOpenAIClass(chatModelConfig);
        
        // Step 8: Initialize LLMGraphTransformer with configured model
        const llmGraphTransformer = new LLMGraphTransformerClass({
            llm: chatModel,
            allowedNodes: [], // Allow all node types
            allowedRelationships: [], // Allow all relationship types
            strictMode: true
        });
        
        dbg("LLMGraphTransformer initialized successfully");
        
        // Step 9: Implement document conversion logic
        
        // Check if we have inputs to process
        if (!state.inputs || Object.keys(state.inputs).length === 0) {
            dbg("No input documents found, skipping graph extraction");
            // Still need to return the current memory state
            const configurable = config?.configurable as any;
            const memoryService = configurable?.memoryService || MemoryService.fromState(state.system_context);
            return {
                ...state,
                system_context: memoryService.getCurrentState()
            };
        }
        
        // Convert state.inputs to LangChain Document objects
        const documents: Document[] = Object.entries(state.inputs).map(([filename, content]) => {
            return new Document({
                pageContent: content,
                metadata: { 
                    source: filename,
                    extractedAt: new Date().toISOString()
                }
            });
        });
        
        dbg(`Converted ${documents.length} documents for graph extraction`);
        
        // Step 10: Implement graph extraction
        
        // Call LLMGraphTransformer to extract knowledge graphs
        const graphDocuments = await llmGraphTransformer.convertToGraphDocuments(documents);
        
        // Handle empty results gracefully
        if (!graphDocuments || graphDocuments.length === 0) {
            dbg("No graph documents extracted from inputs");
            // Still need to return the current memory state
            const configurable = config?.configurable as any;
            const memoryService = configurable?.memoryService || MemoryService.fromState(state.system_context);
            return {
                ...state,
                system_context: memoryService.getCurrentState()
            };
        }
        
        dbg(`Successfully extracted ${graphDocuments.length} graph documents`);
        
        // Count total nodes and relationships for logging
        const totalNodes = graphDocuments.reduce((sum, doc) => sum + doc.nodes.length, 0);
        const totalRelationships = graphDocuments.reduce((sum, doc) => sum + doc.relationships.length, 0);
        
        dbg(`Total extracted: ${totalNodes} nodes, ${totalRelationships} relationships`);
        
        // Step 11: Implement data transformation pipeline
        
        const entities: Entity[] = [];
        const relationships: Relationship[] = [];
        
        // Transform each graph document
        for (const graphDoc of graphDocuments) {
            // Map LLMGraphTransformer nodes to Archie Entity objects
            for (const node of graphDoc.nodes) {
                try {
                    const entity: Entity = {
                        name: normalizeEntityName(String(node.id)),
                        type: node.type || 'concept',
                        description: node.properties?.description || '',
                        properties: node.properties || {},
                        tags: [] // Empty for now (future enhancement)
                    };
                    entities.push(entity);
                    dbg(`Transformed node: ${node.id} -> ${entity.name} (${entity.type})`);
                } catch (error: any) {
                    console.warn(`Failed to transform node ${node.id}: ${error.message}`);
                    // Continue processing other nodes
                }
            }
            
            // Map LLMGraphTransformer relationships to Archie Relationship objects
            for (const rel of graphDoc.relationships) {
                try {
                    const relationship: Relationship = {
                        from: normalizeEntityName(String(rel.source.id)),
                        to: normalizeEntityName(String(rel.target.id)),
                        type: rel.type,
                        properties: rel.properties || {}
                    };
                    relationships.push(relationship);
                    dbg(`Transformed relationship: ${rel.source.id} --[${rel.type}]--> ${rel.target.id}`);
                } catch (error: any) {
                    console.warn(`Failed to transform relationship ${rel.source.id} -> ${rel.target.id}: ${error.message}`);
                    // Continue processing other relationships
                }
            }
        }
        
        dbg(`Transformation complete: ${entities.length} entities, ${relationships.length} relationships`);
        
        // Step 12: Implement MemoryService integration
        
        // Get MemoryService from config (injected for testing) or from state context
        const configurable = config?.configurable as any;
        const memoryService = configurable?.memoryService || MemoryService.fromState(state.system_context);
        
        // Update MemoryService with extracted entities and relationships
        let entitiesAdded = 0;
        let entitiesUpdated = 0;
        let relationshipsAdded = 0;
        
        for (const entity of entities) {
            try {
                const isNew = memoryService.addOrUpdateEntity(entity);
                if (isNew) {
                    entitiesAdded++;
                } else {
                    entitiesUpdated++;
                }
            } catch (error: any) {
                console.warn(`Failed to add/update entity ${entity.name}: ${error.message}`);
                // Continue processing other entities
            }
        }
        
        for (const relationship of relationships) {
            try {
                const success = memoryService.addOrUpdateRelationship(relationship);
                if (success) {
                    relationshipsAdded++;
                }
                // Note: failed relationships are already logged by MemoryService
            } catch (error: any) {
                console.warn(`Failed to add/update relationship ${relationship.from} -> ${relationship.to}: ${error.message}`);
                // Continue processing other relationships
            }
        }
        
        dbg(`Memory update complete: ${entitiesAdded} entities added, ${entitiesUpdated} entities updated, ${relationshipsAdded} relationships added`);
        
        // Serialize updated memory to state.system_context
        const updatedMemoryState = memoryService.getCurrentState();
        
        say(`Graph extraction complete: Added ${entitiesAdded} entities and ${relationshipsAdded} relationships to memory`);
        
        return {
            ...state,
            system_context: updatedMemoryState
        };
        
    } catch (error: any) {
        // Step 13: Comprehensive error handling
        // Log specific errors with console.warn (as required)
        console.warn(`Graph extraction failed: ${error.message}`);
        dbg(`Graph extraction error details: ${error.stack || error}`);
        
        // Categorize and handle different types of errors
        if (error.message?.includes('API key')) {
            console.warn("Graph extraction error: OpenAI API key configuration issue");
        } else if (error.message?.includes('network') || error.message?.includes('timeout')) {
            console.warn("Graph extraction error: Network connectivity issue");
        } else if (error.message?.includes('transform') || error.message?.includes('parse')) {
            console.warn("Graph extraction error: Data transformation issue");
        } else {
            console.warn("Graph extraction error: Unknown error during knowledge graph extraction");
        }
        
        // Return unchanged state - never throw exceptions that would break the flow
        dbg("Returning unchanged state due to graph extraction failure");
        return state;
    }
} 