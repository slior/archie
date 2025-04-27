

# Archie: Architecture Assistant

## High Level System Specification

Archie is a system of AI agents that assist in various tasks of software architecture - analysis and design.
Its main purpose is to aid system designers and developers to clearly communicate existing structures, design decisions, assumptions, etc.

- The system maintains a running view of the system considered.
- The system will allow updating the view based on new decisions and inputs.
- The system will analyze new requirements or bug reports, with the existing known system information in order to help finding optimal solutions, according to constraints given by the user, and best practices.

## User Interface

The basic user interface of the system is chat-like interface, and generating files or reading files as inputs.

For initial phase, the system will be invoked from the command line, and will communicate with the user on the command line.
The command line interface should be convenient and robust.
When invoked the system should enter into a "shell" mode, and interact with the user on its own shell.
The user should have an 'exit' command to stop the program.
Lists and selection should be presented in a clean and pleasent way, and allow easy choice.
The shell should allow long answers from the user to specific questions from various agents - a chat like interface on the command line.

The CLI will use commander and inquirer, aiming for minimal dependencies.

Later evolutions of the system may have different interfaces, e.g. web-based, so it's important to clearly demarcate the user interface from the core business logic of the system, including agent invocation and choices of which agents to activate.


## General
1. The agents will use the memory mechanism (MemoryService) to store the overall system view, and pass it as state between the agents.
2. Inputs will be file-based (relative or absolute paths) for text/markdown/log files.
3. The agent architecture will involve multiple agents (Analysis, Documenter, Planning, Info Gathering, etc.) orchestrated by a supervisor in a simple flow.
4. LLM configuration will be flexible (multiple models supported) via environment variables or CLI arguments.
5. Persistence will be handled via text files (JSON/Markdown).
6. The project will use tsc for compilation with a simple setup and minimal dependencies.


## Analysis Agent

The analysis agent will incorporate various artifacts to help the user analyze and plan new tasks.
Input artifacts include:
1. Description of known components of the system
2. Description of known flows in the system.
3. Past design decisions
4. Execution logs and traces.
5. System code artifacts.
6. Feature request(s) and/or bug reports.

The agent should engage the user in a conversation with the aim of analyzing the existing material and come up with an implementation plan for the task at hand.
The agent should engage ask the user any clarifying questions.
The agent should ask the user for an explicit description of the task, if not given.
The user should answer any questions.
The agent should compile the answers, and offer solution options, explaining trade offs between options.
The user may choose to ask further questions.
This cycle should proceed until the user specifically inputs: "SOLUTION APPROVED".

Upon approval, the agent should output a detailed description of the approved solution.
This should include a complete account of all assumptions, all decisions, and reasoning for the choice of this specific solution.
