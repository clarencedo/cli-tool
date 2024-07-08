import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import { execSync } from "child_process";

export function createNewProject(projectName: string) {
  const targetPath = path.resolve(process.cwd(), projectName);

  if (fs.existsSync(targetPath)) {
    console.log(
      chalk.red(`Error: Project directory ${projectName} already exists.`),
    );
    process.exit(1);
  }

  fs.mkdirSync(targetPath, { recursive: true });

  const templatePath = path.resolve(__dirname, "../templates/project-template");

  copyTemplateFiles(templatePath, targetPath);

  console.log(chalk.green(`Project ${projectName} created successfully.`));
  try {
    process.chdir(targetPath);
    console.log(chalk.blue(`Installing dependencies...`));
    execSync("npm install", { stdio: "inherit" });
  } catch (error) {
    if (error instanceof Error) {
      console.error(
        chalk.red(
          `Failed to change directory to ${targetPath}: ${error.message}`,
        ),
      );
    } else {
      console.error(
        chalk.red(
          `Failed to change directory to ${targetPath}: ${String(error)}`,
        ),
      );
    }
    process.exit(1);
  }

  console.log(chalk.green(`Project setup complete. To get started, run:`));
  console.log(chalk.cyan(`cd ${projectName}`));
  console.log(chalk.cyan(`npm start`));
}

function copyTemplateFiles(srcDir: string, destDir: string) {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  entries.forEach((entry) => {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyTemplateFiles(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  });
}
