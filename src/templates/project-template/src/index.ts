import { moduleAFunction } from "./module/moduleA";
import { connectToDatabase } from "./db/database";
import { moduleBFunction } from "./module/moduleB";
connectToDatabase();
moduleAFunction();
moduleBFunction();

console.log("Project setup complete.");
