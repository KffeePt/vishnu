import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeminiClient {
    private model: any;

    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn("⚠️  GEMINI_API_KEY is not set. AI features will be disabled.");
        } else {
            const genAI = new GoogleGenerativeAI(apiKey);
            this.model = genAI.getGenerativeModel({ model: "gemini-pro" });
        }
    }

    async chat(history: { role: 'user' | 'model'; parts: string }[], message: string) {
        if (!this.model) return "AI is disabled (Missing API Key).";

        // Simple wrapper for now
        const chat = this.model.startChat({
            history: history.map(h => ({ role: h.role, parts: [{ text: h.parts }] })),
        });

        const result = await chat.sendMessage(message);
        const response = await result.response;
        return response.text();
    }

    async streamChat(history: any[], message: string, onToken: (text: string) => void) {
        if (!this.model) {
            onToken("AI is disabled.");
            return;
        }
        const chat = this.model.startChat({
            history: history.map(h => ({ role: h.role, parts: [{ text: h.parts }] })),
        });

        const result = await chat.sendMessageStream(message);
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            onToken(chunkText);
        }
    }
}

export const aiClient = new GeminiClient();
