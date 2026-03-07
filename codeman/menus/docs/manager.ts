import { z } from 'zod';
import { MenuNode } from '../../core/types';
import { List } from '../../components/list';
import { Input } from '../../components/input';
import { aiClient } from '../../agents/client';
import fs from 'fs';
import path from 'path';

export const DocsManagerMenu: MenuNode = {
    id: 'docs-manager',
    propsSchema: z.void(),
    render: async (_props, _state) => {
        const choice = await List('📚 Documentation Manager', [
            { name: '✨ Generate Component Docs', value: 'gen-comp' },
            { name: '⬅️  Back', value: 'back' }
        ]);

        if (choice === 'gen-comp') {
            const filePath = await Input('Enter component path (e.g. components/Button.tsx)', _state);
            if (filePath && fs.existsSync(filePath)) {
                console.log(`\nGenerating docs for ${filePath}...`);
                const content = fs.readFileSync(filePath, 'utf-8');
                const prompt = `Generate technical documentation for this component:\n\n${content}`;

                // Assume single-shot chat
                const response = await aiClient.chat([], prompt);

                const docPath = `docs/components/${path.basename(filePath, path.extname(filePath))}.md`;
                const docDir = path.dirname(docPath);
                if (!fs.existsSync(docDir)) fs.mkdirSync(docDir, { recursive: true });

                fs.writeFileSync(docPath, response);
                console.log(`✅ Saved to ${docPath}`);

                // Wait for user before clearing
                await Input('Press Enter to continue...', _state);
            } else {
                console.log('File not found.');
                await Input('Press Enter to continue...', _state);
            }
            return 'docs-manager';
        }

        return 'ROOT';
    },
    next: (result) => {
        if (result === 'back') return 'ROOT';
        return result;
    }
};
