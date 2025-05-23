# Assignment 6: Interview Analysis (mp3)

## Task Description

This assignment involves analyzing audio recordings from witness interviews to determine the street name where Professor Andrzej Maj's institute is located. The information is hidden within witness testimonies, which may contradict or complement each other.

## Solution Process

1. **Download and Extract Recordings**
   - Recordings are downloaded from: https://c3ntrala.ag3nts.org/dane/przesluchania.zip
   - Extracted files are stored in the `przesluchania/` directory

2. **Generate Transcriptions**
   - Using OpenAI's Whisper model for audio-to-text conversion
   - Transcripts are saved in the `transcripts/` directory for later use

3. **Text Analysis**
   - Transcripts are analyzed by a language model to extract street name information
   - Special emphasis is placed on Rafał's testimony, who had close contact with the professor
   - The model applies a methodical approach to analyzing conflicting information

4. **Submit Answer**
   - The discovered street name is sent to the Central API
   - Response format: `{"task": "mp3", "apikey": "YOUR_API_KEY", "answer": "Street Name"}`

## Execution

To run the solution:

```bash
cd ai_devs_course
bun run zad6/app.ts
```

## Requirements

- Node.js / Bun
- OpenAI API Key (for Whisper model)
- Central API Key in the .env file (PERSONAL_API_KEY)
- Langfuse API Keys for telemetry (optional)

## Notes

- The analysis considers potential inconsistencies in testimonies
- The solution uses two-stage verification for reliability
- Analysis results are saved locally before being sent to the API
- Telemetry is captured in Langfuse for performance monitoring