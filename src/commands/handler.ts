// import * as fs from "fs";
// import * as path from "path";
// import chalk from "chalk";
//
// export function createHandler(
//   handlerName: string,
//   directory: string = "./src/handlers",
// ) {
//   const targetDir = path.resolve(process.cwd(), directory);
//   const targetPath = path.resolve(targetDir, handlerName);
//
//   // Ensure the target directory exists
//   if (!fs.existsSync(targetDir)) {
//     fs.mkdirSync(targetDir, { recursive: true });
//   }
//
//   // Check if handler already exists
//   if (fs.existsSync(targetPath)) {
//     console.log(
//       chalk.red(
//         `Error: Handler ${handlerName} already exists in ${directory}.`,
//       ),
//     );
//     process.exit(1);
//   }
//
//   // Create handler directory
//   fs.mkdirSync(targetPath, { recursive: true });
//
//   // Copy template files
//   const templatePath = path.resolve(
//     __dirname,
//     "../templates/handlers/handler.ts",
//   );
//   copyTemplateFiles(templatePath, targetPath);
//
//   console.log(chalk.green(`Handler ${handlerName} created successfully.`));
// }
//
// function copyTemplateFiles(srcDir: string, destDir: string) {
//   const entries = fs.readdirSync(srcDir, { withFileTypes: true });
//
//   entries.forEach((entry) => {
//     const srcPath = path.join(srcDir, entry.name);
//     const destPath = path.join(destDir, entry.name);
//
//     if (entry.isDirectory()) {
//       fs.mkdirSync(destPath, { recursive: true });
//       copyTemplateFiles(srcPath, destPath);
//     } else {
//       fs.copyFileSync(srcPath, destPath);
//     }
//   });
// }
//

import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";

export function createHandler(
  handlerName: string,
  directory: string = "./src/handlers",
) {
  const targetDir = path.resolve(process.cwd(), directory);
  const targetPath = path.resolve(targetDir, `${handlerName}.ts`); // Append .ts for file

  // Ensure the target directory exists
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Check if handler already exists
  if (fs.existsSync(targetPath)) {
    console.log(
      chalk.red(
        `Error: Handler ${handlerName}.ts already exists in ${directory}.`,
      ),
    );
    process.exit(1);
  }

  // Copy template file
  const templatePath = path.resolve(
    __dirname,
    "../templates/project-template/src/handlers/handler.ts",
  );
  fs.copyFileSync(templatePath, targetPath);

  console.log(chalk.green(`Handler ${handlerName}.ts created successfully.`));
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

// const templatePath = path.resolve(__dirname, "../templates/project-template");
