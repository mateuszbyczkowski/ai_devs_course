import * as fs from 'fs';
import * as path from 'path';

// File paths
const correctFilePath = path.join(__dirname, 'lab_data', 'correct.txt');
const incorrectFilePath = path.join(__dirname, 'lab_data', 'incorect.txt');
const outputFilePath = path.join(__dirname, 'training_data.jsonl');

// Process files and create JSONL
async function createTrainingData() {
  try {
    // Read both files
    const correctContent = fs.readFileSync(correctFilePath, 'utf8');
    const incorrectContent = fs.readFileSync(incorrectFilePath, 'utf8');

    // Split into lines and clean them
    const correctLines = correctContent
      .split('\n')
      .map(line => line.replace(/\r$/, '').trim())
      .filter(line => line);
    const incorrectLines = incorrectContent
      .split('\n')
      .map(line => line.replace(/\r$/, '').trim())
      .filter(line => line);

    // Prepare JSONL data
    const jsonlData: string[] = [];

    // Process correct data - label as "1"
    for (const line of correctLines) {
      const entry = {
        messages: [
          { role: "system", content: "validate data" },
          { role: "user", content: line },
          { role: "assistant", content: "1" }
        ]
      };
      jsonlData.push(JSON.stringify(entry));
    }

    // Process incorrect data - label as "0"
    for (const line of incorrectLines) {
      const entry = {
        messages: [
          { role: "system", content: "validate data" },
          { role: "user", content: line },
          { role: "assistant", content: "0" }
        ]
      };
      jsonlData.push(JSON.stringify(entry));
    }

    // Write to JSONL file
    fs.writeFileSync(outputFilePath, jsonlData.join('\n'));
    
    console.log(`Successfully created training data at ${outputFilePath}`);
    console.log(`Total entries: ${jsonlData.length}`);
    console.log(`- Correct entries: ${correctLines.length}`);
    console.log(`- Incorrect entries: ${incorrectLines.length}`);
    
  } catch (error) {
    console.error('Error creating training data:', error);
  }
}

// Execute the function
createTrainingData();