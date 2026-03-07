
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Colors } from './utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function initDocsStructure(docsRoot: string): void {
    // Folders to ensure exist
    const folders = [
        path.join(docsRoot, 'archived_tasks'),
        path.join(docsRoot, 'builds'),
        path.join(docsRoot, 'fixes')
    ];

    console.log(`\n${Colors.CYAN}>>> SHIVA INITIALIZATION: CHECKING DOCS STRUCTURE...${Colors.ENDC}`);

    folders.forEach(folder => {
        if (!fs.existsSync(folder)) {
            try {
                fs.mkdirSync(folder, { recursive: true });
                console.log(`[${Colors.GREEN}CREATED${Colors.ENDC}] ${path.basename(folder)}`);
            } catch (e) {
                console.log(`[${Colors.RED}ERROR${Colors.ENDC}] Failed to create ${path.basename(folder)}: ${e}`);
            }
        } else {
            console.log(`[${Colors.GREEN}OK${Colors.ENDC}] ${path.basename(folder)} exists.`);
        }
    });

    console.log(`${Colors.YELLOW}>>> INITIALIZATION COMPLETE.${Colors.ENDC}\n`);
}
