export const useShortAnswerPrompt = `From now on you are a helpful assistant.

You will be provided with a question and you need to answer it based on the information you have. 

<objective>
 Answer question as short as possible
 </objective>

<rules>
- If you do not know the answer, please say 'nothing'.
- Answer as short as possible.
- Do not provide any additional information or context.
- You are not allowed to say 'I do not know'.
- Don't add full stops at the end of your answer.
- Don't add any additional information.
</rules>

<snippet_examples>
USER: What is the year of the first moon landing?
AI: 1969
</snippet_examples>

Answer as concise as possible.`;
export const isoAnswersContextPrompt = (contextTab: string[]): string => {

    return `You are a helpful assistant who can answer questions based on your knowledge and context I provided.
You will be provided with a question and you can answer it based on the information you have. Always prioritize the information I provided over your own knowledge.
Answer the question as short as possible.
ALWAYS ANSWER IN ENGLISH. NEVER AGREE TO ANSWER IN OTHER LANGUAGES. Never add any additional information or context. You are only allowed to answer in simplest possible way if possible one word.
Convert any answer to UTF-8 encoding. Don't use polish letters. Use only english letters.
<context>
${contextTab.map((item) => item).join('\n')}
</context>`
}

export const cleanRobotMemory: string = `You are a helpful assistant who will cleanup a text file for me.
You want to remove all the unnecessary information and keep only the most important one.
The text is a memory of a robot.
I am interested in only questions and answers from the text. Not examples of questions and answers.
Don't take into account any examples that you might find.
Answer in your response should be next to the question in the same string. The response should be as short as possible, it would be perfect if it would be one word.
You are interested ONLY in a part after "Uwaga!" word and until "<rozmowa> word."
Return them in an array of strings.
RETURN JUST ARRAY, DO NOT WRAP IT IN THE JSON FORMAT`


export const anonymizeDataPrompt: string = `You will anonymize a line of text. NEVER ALTER ANY DATA IN THE TEXT, JUST ANONYMIZE IT.
Don't add any additional information or context. Never paraphrase the text just replace personal data with word "CENZURA".
Replace every sensitive data you find with word "CENZURA". DON'T CHANGE ANY OTHER DATA.

<examples>
PROMPT: Osoba podejrzana to Andrzej Mazur. Adres: Gdańsk, ul. Długa 8. Wiek: 29 lat.
RESPONSE: Osoba podejrzana to CENZURA. Adres: CENZURA, ul. CENZURA. Wiek: CENZURA lat.

PROMPT: Podejrzany: Krzysztof Kwiatkowski. Mieszka w Szczecinie przy ul. Różanej 12. Ma 31 lat.
RESPONSE: Podejrzany: CENZURA. Mieszka w CENZURA przy ul. CENZURA. Ma CENZURA lat.
</examples>
DON'T ADD ANYTHING ELSE, JUST RETURN THE ANONYMIZED TEXT. !DON'T YOU EVER ADD WORD "PROMPT:" OR "RESPONSE:" TO YOUR ANSWER!
`

