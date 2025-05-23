import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import OpenAI from 'openai';

/**
 * Simplified map analysis script that uses OpenAI's Vision API
 * to analyze a map image divided into four quadrants.
 */
async function analyzeMap() {
  try {
    // Initialize OpenAI client
    const openai = new OpenAI();
    
    // Path to image
    const imagePath = path.join(__dirname, 'mapa.jpeg');
    
    // Read and encode image
    const imageBuffer = readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    
    console.log('Analyzing map image...');
    
    // Call OpenAI Vision API
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this image containing 4 maps in quadrants (top-left, top-right, bottom-left, bottom-right).
              
              For each map:
              1. List all visible street names (maintain Polish spelling)
              2. Identify landmarks, buildings, and points of interest
              3. Note any neighborhoods or districts
              4. Extract any coordinates or location information
              5. Determine which Polish city this map likely represents
              
              After analyzing each map, determine if all maps show the same city or if any appear different/fake.`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 4096
    });
    
    // Get analysis results
    const results = response.choices[0].message.content || 'No results returned';
    
    // Display and save results
    console.log('\n=== MAP ANALYSIS RESULTS ===\n');
    console.log(results);
    
    // Save to file
    const outputPath = path.join(__dirname, 'analysis_results.txt');
    writeFileSync(outputPath, results, 'utf8');
    console.log(`\nResults saved to: ${outputPath}`);
    
    return results;
  } catch (error) {
    console.error('Error analyzing map:', error);
    throw error;
  }
}

// Run analysis
analyzeMap()
  .then(() => console.log('Analysis complete.'))
  .catch(error => {
    console.error('Failed to complete analysis:', error);
    process.exit(1);
  });