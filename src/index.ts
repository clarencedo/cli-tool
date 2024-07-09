#! /usr/bin/env node

import { Command } from "commander";
import { createNewProject } from "./commands/new";
import { createHandler } from "./commands/handler";
import { createMiddleware } from "./commands/middleware";
import { cloneNewProject } from "./commands/clone";

const program = new Command();

program.version("1.0.0").description("A CLI for FOMO Framework");

function handleSubCommands(subCmd: string, params: string[]) {
    switch (subCmd) {
        case "new":
            //createNewProject(params[0]);
            cloneNewProject(params[0]);
            break;
        case "handler":
            console.log(`Creating a new handler ${params[0]}`);
            createHandler(params[0]);
            break;
        case "middleware":
            console.log(`Creating a new middleware ${params[0]}`);
            createMiddleware(params[0]);
            break;
        default:
            console.log(`Unknown command: ${subCmd}`);
    }
}

program
    .command("g <subCmd> [params...]")
    .description("Generate project structures")
    .action((subCmd: string, params: string[]) => {
        handleSubCommands(subCmd, params);
    });

program
    .command("generate <subCmd> [params...]")
    .description("Generate project structures")
    .action((subCmd: string, params: string[]) => {
        handleSubCommands(subCmd, params);
    });

program.addHelpText(
    "after",
    `
Usage:
  $ fomo g/generate new <projectName>          Create a new project
  $ fomo g/generate handler <name> <path>       Create a new handler
  $ fomo g/generate middleware <name>           Create a new middleware
`
);

program.parse(process.argv);
