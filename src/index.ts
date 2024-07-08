#! /usr/bin/env node

import { Command } from "commander";
import { createNewProject } from "./commands/new";
import { createHandler } from "./commands/handler";
const program = new Command();

program.version("1.0.0").description("A CLI for FOMO Framework ");

program
  .command("new <projectName>")
  .description("Create a new project")
  .action((projectName: string) => createNewProject(projectName));

program
  .command("handler <handlerName> [directory]")
  .description("Create a new handler")
  .action((handlerName: string, directory?: string) => {
    createHandler(handlerName, directory);
  });

program
  .command("middleware <middlewareName>")
  .description("Create a new middleware")
  .action((middlewareName: string) => {
    console.log(`Creating a new middleware ${middlewareName}`);
  });

program.parse(process.argv);
