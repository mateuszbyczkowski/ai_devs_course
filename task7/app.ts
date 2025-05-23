import { OpenAIService } from '../services/OpenAIService';
import { readFileSync } from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { saveResults } from './saveResults';

/**
 * Analyzes a map image divided into four quadrants
 * Uses GPT-4 Vision to identify street names, landmarks, and location information
 * 
 * @returns Promise with the analysis text
 */
async function analyzeMapImage() {
  try {
    // Initialize OpenAI client directly for vision capabilities
    // OpenAIService doesn't have vision support built in
    const openai = new OpenAI();
    
    // Path to the image file
    const imagePath = path.join(__dirname, 'mapa.jpeg');
    
    // Read the image file and convert to base64
    const imageBuffer = readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    
    // Prepare the request with detailed prompt for map analysis
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Please analyze this image containing 4 maps in different quadrants:
              
              - Top-Left Quadrant (Map 1)
              - Top-Right Quadrant (Map 2)
              - Bottom-Left Quadrant (Map 3)
              - Bottom-Right Quadrant (Map 4)
              
              For each map quadrant:
              1. Identify all street names visible in the map (maintain original Polish spelling)
              2. Note any landmarks, buildings, or points of interest with their exact names
              3. Identify neighborhoods or districts if mentioned
              4. Extract any coordinates, location markers, or scale information
              5. Determine the city in Poland this map likely represents
              
              Format your analysis with clear headings for each quadrant and categories within.
              Keep information from each map separate and clearly labeled.
              Be precise with names and locations - Polish spelling is critical.
              Don't make up information that isn't visible in the maps.
              
              After analyzing each map separately, provide a conclusion about whether all maps show the same Polish city or if any appear to be from a different location or potentially fake.`
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
    
    // Process and format the analysis results
    const rawAnalysisResult = response.choices[0].message.content || '';
    
    // Format the output with clear section separators
    const formattedResult = formatAnalysisResults(rawAnalysisResult);
    
    // Display results
    console.log("=== MAP ANALYSIS RESULTS ===");
    console.log(formattedResult);
    
    // Save both raw and formatted results
    await saveResults(rawAnalysisResult, 'map_analysis_raw.txt');
    await saveResults(formattedResult, 'map_analysis_formatted.txt');
    
    return formattedResult;
  } catch (error) {
    console.error("Error analyzing map image:", error);
    throw error;
  }
}

/**
 * Formats raw analysis results with improved readability
 * 
 * @param rawText The raw analysis text from the API
 * @returns Formatted text with consistent styling
 */
function formatAnalysisResults(rawText: string): string {
  // Add a header
  let formatted = "# Map Analysis Results\n\n";
  formatted += "## Analysis of Four Map Quadrants\n\n";
  
  // Add the raw text with section dividers
  const sections = rawText.split(/#{2,3}\s+/);
  
  if (sections.length > 1) {
    // Process each section with improved formatting
    for (let i = 1; i < sections.length; i++) {
      const section = sections[i];
      const sectionTitle = section.split('\n')[0];
      const sectionContent = section.substring(sectionTitle.length).trim();
      
      formatted += `### ${sectionTitle.trim()}\n\n`;
      formatted += `${sectionContent}\n\n`;
      formatted += "---\n\n";
    }
  } else {
    // If no clear sections, just use the raw text
    formatted += rawText;
  }
  
  // Add timestamp
  formatted += `\n\nAnalysis generated: ${new Date().toLocaleString()}\n`;
  
  return formatted;
}

// Run the analysis
analyzeMapImage()
  .then(result => {
    console.log("\nAnalysis complete. Results saved to files.");
    console.log("- Raw results: map_analysis_raw.txt");
    console.log("- Formatted results: map_analysis_formatted.txt");
  })
  .catch(error => {
    console.error("Analysis failed:", error);
    process.exit(1);
  });