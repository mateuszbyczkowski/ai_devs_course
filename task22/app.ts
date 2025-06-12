import { GenericAIAgent } from "./agent/GenericAIAgent";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Execute the GPS task autonomously
async function main() {
  const taskDescription = "Find GPS coordinates for people who were waiting for Rafał in Lubawa, but exclude Barbara from the results and submit to task 'gps'";
  
  console.log("🚀 Starting GPS Task");
  const result = await GenericAIAgent.solveTask(taskDescription);
  console.log("✅ Task completed:", result);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length > 0) {
    // Custom task from command line
    const taskDescription = args.join(' ');
    GenericAIAgent.solveTask(taskDescription).then(result => {
      console.log('🎯 Task Result:', result);
    }).catch(console.error);
  } else {
    // Default GPS task
    main().catch(console.error);
  }
}

export { GenericAIAgent };
