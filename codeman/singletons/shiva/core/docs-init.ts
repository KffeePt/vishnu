
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Colors } from './utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function initDocsStructure(docsRoot: string): string[] {
    // Folders to ensure exist
    const folders = [
        path.join(docsRoot, 'tasks'),
        path.join(docsRoot, 'git'),
        path.join(docsRoot, 'audits'),
        path.join(docsRoot, 'specs'),
        path.join(docsRoot, 'pending')
    ];

    const logs: string[] = [];
    logs.push(`${Colors.CYAN}>>> SHIVA INITIALIZATION: CHECKING DOCS STRUCTURE...${Colors.ENDC}`);

    folders.forEach(folder => {
        if (!fs.existsSync(folder)) {
            try {
                fs.mkdirSync(folder, { recursive: true });
                logs.push(`[${Colors.GREEN}CREATED${Colors.ENDC}] ${path.basename(folder)}`);
            } catch (e) {
                logs.push(`[${Colors.RED}ERROR${Colors.ENDC}] Failed to create ${path.basename(folder)}: ${e}`);
            }
        } else {
            logs.push(`[${Colors.GREEN}OK${Colors.ENDC}] ${path.basename(folder)} exists.`);
        }
    });

    const docsFiles: Array<{ folder: string; filename: string; content: string }> = [
        {
            folder: 'tasks',
            filename: 'TASKS.md',
            content: [
                '# Tasks',
                '',
                'Use this folder for active and archived task nodes that Shiva organizes.',
                '',
                'How it works:',
                '- Drop new task files directly into `docs/tasks/`.',
                '- Shiva scans and organizes files using the timestamp pattern below.',
                '- Organized files land in dated folders so tasks stay chronological.',
                '',
                'Filename pattern (unorganized):',
                '- `slug_YYYYMMDDTHHMMSS.md`',
                '',
                'Result after Shiva:',
                '- `YYYY-MM-DD/slug_HH-MM-SS.md`',
                '',
                'Suggested sections:',
                '- Title',
                '- Intent',
                '- Context',
                '- Next steps',
                '- Done when',
                ''
            ].join('\n')
        },
        {
            folder: 'git',
            filename: 'GIT.md',
            content: [
                '# Git',
                '',
                'This folder is for Git workflow notes, release checklists, and automation logs.',
                'Use it for PR plans, branching notes, release steps, and forensic timelines.',
                '',
                'How it works:',
                '- Drop new notes into `docs/git/` with the timestamp pattern below.',
                '- Shiva will move them into dated folders.',
                '',
                'Filename pattern (unorganized):',
                '- `slug_YYYYMMDDTHHMMSS.md`',
                '',
                'Result after Shiva:',
                '- `YYYY-MM-DD/slug_HH-MM-SS.md`',
                '',
                'Custom workflow (append below):',
                ''
            ].join('\n')
        },
        {
            folder: 'audits',
            filename: 'AUDITS.md',
            content: [
                '# Audits',
                '',
                'Security audits, architecture reviews, refactor notes, and risk reports.',
                'Audits are chronological and automatically organized by Shiva.',
                '',
                'How it works:',
                '- Drop audit notes into `docs/audits/`.',
                '- Shiva sorts them into date folders.',
                '',
                'Filename pattern (unorganized):',
                '- `slug_YYYYMMDDTHHMMSS.md`',
                '',
                'Result after Shiva:',
                '- `YYYY-MM-DD/slug_HH-MM-SS.md`',
                '',
                'Suggested sections:',
                '- Scope',
                '- Findings',
                '- Risks',
                '- Recommendations',
                '- Follow-ups',
                ''
            ].join('\n')
        },
        {
            folder: 'specs',
            filename: 'SPECS.md',
            content: [
                '# Specs',
                '',
                'This folder contains canonical specifications for Vishnu, Codeman, and related systems.',
                'Specs are curated and are not auto-organized by Shiva.',
                '',
                '## Spec Naming',
                '- `RFC_###.md` (recommended for canonical architecture docs)',
                '- Other names are allowed when a custom organization is required.',
                '',
                '## Spec Format (recommended)',
                '1. Title',
                '2. Summary',
                '3. Goals / Non-goals',
                '4. Design',
                '5. Interfaces / APIs',
                '6. Data flow',
                '7. Edge cases',
                '8. Test plan',
                '',
                '## CLI Usage',
                '- Show Codeman help: `codeman --help`',
                '- Start Codeman TUI: `npm run codeman`',
                '- Use Dev Dojo > Doc Actions to generate boilerplates and prompts',
                '',
                '## Notes',
                'Specs are not timestamped. Updating a spec updates the file modified date for tracking.',
                ''
            ].join('\n')
        }
    ];

    for (const doc of docsFiles) {
        const docPath = path.join(docsRoot, doc.folder, doc.filename);
        if (!fs.existsSync(docPath)) {
            try {
                fs.writeFileSync(docPath, doc.content, 'utf8');
                logs.push(`[${Colors.GREEN}CREATED${Colors.ENDC}] ${path.join(doc.folder, doc.filename)}`);
            } catch (e) {
                logs.push(`[${Colors.RED}ERROR${Colors.ENDC}] Failed to create ${path.join(doc.folder, doc.filename)}: ${e}`);
            }
        }
    }

    const pendingIndexPath = path.join(docsRoot, 'pending', 'PENDING.md');
    if (!fs.existsSync(pendingIndexPath)) {
        try {
            const content = [
                '# Pending Tasks',
                '',
                'This index is auto-updated by agents and Shiva.',
                'Pending task nodes live in `docs/pending/` and can be created from Dev Dojo.',
                'Pending nodes are not auto-organized; they stay in this folder.',
                '',
                '<!-- AUTO-GENERATED START -->',
                'No pending tasks yet.',
                '<!-- AUTO-GENERATED END -->',
                ''
            ].join('\n');
            fs.mkdirSync(path.dirname(pendingIndexPath), { recursive: true });
            fs.writeFileSync(pendingIndexPath, content, 'utf8');
            logs.push(`[${Colors.GREEN}CREATED${Colors.ENDC}] pending/PENDING.md`);
        } catch (e) {
            logs.push(`[${Colors.RED}ERROR${Colors.ENDC}] Failed to create pending/PENDING.md: ${e}`);
        }
    }

    logs.push(`${Colors.YELLOW}>>> INITIALIZATION COMPLETE.${Colors.ENDC}`);
    return logs;
}
