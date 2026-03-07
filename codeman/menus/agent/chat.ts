import { z } from 'zod';
import { MenuNode } from '../../core/types';
import { Input } from '../../components/input';
import { aiClient } from '../../agents/client';
import { ContextManager } from '../../agents/context';

export const AgentChatMenu: MenuNode = {
    id: 'agent-chat',
    propsSchema: z.void(),
    render: async (_props, state) => {
        console.log('\n💬 Agent Mode (Type "exit" to quit, "clear" to reset context)\n');

        // 1. Build Context if new session
        if (!state.agent.contextSummary) {
            console.log('🧠 Building Context...');
            state.agent.contextSummary = await ContextManager.buildSystemPrompt();
            // Prepend system prompt to history if empty
            if (state.agent.conversationHistory.length === 0) {
                state.agent.conversationHistory.push({
                    role: 'user',
                    parts: `SYSTEM PROMPT:\n${state.agent.contextSummary}\n\nUser is initiating chat.`
                });
                state.agent.conversationHistory.push({
                    role: 'model',
                    parts: 'Understood. I am your Agentic Code Assistant. How can I help?'
                });
            }
        }

        // 2. Input Loop
        while (true) {
            const query = await Input('🤖 You', state);

            if (query.trim().toLowerCase() === 'exit') {
                return 'back';
            }
            if (query.trim() === '') continue;

            process.stdout.write('✨ Assistant: ');

            // Add user msg
            state.agent.conversationHistory.push({ role: 'user', parts: query });

            let fullResponse = '';
            await aiClient.streamChat(state.agent.conversationHistory, query, (token) => {
                process.stdout.write(token);
                fullResponse += token;
            });
            process.stdout.write('\n');

            state.agent.conversationHistory.push({ role: 'model', parts: fullResponse });
        }
    },
    next: (result) => {
        // Input Loop handles interactions internaly. 
        // render() only returns when user types exit.
        return 'ROOT';
    }
};
