import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";

export function createHandler(
    handlerName: string,
    directory: string = "./src/handlers"
) {
    const targetDir = path.resolve(process.cwd(), directory);
    const handlerDir = path.resolve(targetDir, handlerName);
    const indexPath = path.resolve(handlerDir, "index.ts");

    // Ensure the target directory exists
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    // Check if handler directory already exists
    if (fs.existsSync(handlerDir)) {
        console.log(
            chalk.red(
                `Error: Handler directory ${handlerName} already exists in ${directory}.`
            )
        );
        process.exit(1);
    }

    // Create handler directory
    fs.mkdirSync(handlerDir);

    // Copy template index file to the handler directory
    const templatePath = path.resolve(
        __dirname,
        "../templates/project-template/src/handlers/index.ts"
    );
    fs.copyFileSync(templatePath, indexPath);

    console.log(chalk.green(`Handler ${handlerName} created successfully.`));
}
