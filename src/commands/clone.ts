import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import { execSync } from "child_process";

export function cloneNewProject(projectName: string) {
    const targetPath = path.resolve(process.cwd(), projectName);
    const templateRepo =
        "https://gitlab.fomopay.net/zcy/nodeserver-boilerplate-ts.git";
    if (fs.existsSync(targetPath)) {
        console.log(
            chalk.red(`Error: Project directory ${projectName} already exists.`)
        );
        process.exit(1);
    }

    try {
        console.log(chalk.blue(`Cloning template project...`));
        execSync(`git clone ${templateRepo} ${projectName}`);
    } catch (error) {
        if (error instanceof Error) {
            console.error(
                chalk.red(`Failed to clone template project: ${error.message}`)
            );
        } else {
            console.error(
                chalk.red(`Failed to clone template project: ${String(error)}`)
            );
        }
        process.exit(1);
    }

    console.log(chalk.green(`Project ${projectName} created successfully.`));

    try {
        process.chdir(targetPath);
        console.log(chalk.blue(`Installing dependencies...`));
        execSync("npm install", { stdio: "inherit" });
    } catch (error) {
        if (error instanceof Error) {
            console.error(
                chalk.red(
                    `Failed to change directory to ${targetPath}: ${error.message}`
                )
            );
        } else {
            console.error(
                chalk.red(
                    `Failed to change directory to ${targetPath}: ${String(error)}`
                )
            );
        }
        process.exit(1);
    }

    console.log(chalk.green(`Project setup complete. To get started, run:`));
    console.log(chalk.cyan(`cd ${projectName}`));
    console.log(chalk.cyan(`npm run watch-debug`));
}
