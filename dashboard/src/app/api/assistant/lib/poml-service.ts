import { existsSync, promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { PomlBlockSchema, PomlBlock } from '@/zod_schemas';
import { z } from 'zod';

class PomlService {
  private prompts = new Map<string, PomlBlock[]>();

  constructor() {
    this.loadPrompts();
  }

  private async loadPrompts() {
    const promptDirCandidates = [
      path.join(process.cwd(), 'src/app/api/assistant/prompts'),
      path.join(process.cwd(), 'app/api/assistant/prompts'),
    ];
    const promptsDir = promptDirCandidates.find((candidate) => existsSync(candidate));

    if (!promptsDir) {
      console.warn('Assistant prompts directory was not found. POML prompts will stay unloaded.');
      return;
    }

    const files = await fs.readdir(promptsDir);

    for (const file of files) {
      if (path.extname(file) === '.poml') {
        const filePath = path.join(promptsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const blocks = this.parsePoml(content);
        this.prompts.set(path.basename(file, '.poml'), blocks);
      }
    }
  }

  private parsePoml(content: string): PomlBlock[] {
    const blocks: PomlBlock[] = [];
    // Split on '---' only when it appears on its own line (with optional surrounding whitespace)
    const parts = content.split(/^---$/m).map(p => p.trim()).filter(Boolean);

    if (parts.length === 2) {
      const headerPart = parts[0];
      const templatePart = parts[1];

      if (headerPart && templatePart) {
        try {
          const header = yaml.load(headerPart);
          const parsedBlock = PomlBlockSchema.parse(header);
          blocks.push({ ...parsedBlock, template: templatePart });
        } catch (error) {
          if (error instanceof z.ZodError) {
            console.error('Zod validation error parsing POML header:', error.errors);
          } else {
            console.error('Error parsing POML header:', error);
          }
        }
      }
    } else {
      for (let i = 0; i < parts.length; i += 2) {
        const headerPart = parts[i];
        const templatePart = parts[i + 1];

        if (headerPart && templatePart) {
          try {
            const header = yaml.load(headerPart);
            const parsedBlock = PomlBlockSchema.parse(header);
            blocks.push({ ...parsedBlock, template: templatePart });
          } catch (error) {
            if (error instanceof z.ZodError) {
              console.error('Zod validation error parsing POML header:', error.errors);
            } else {
              console.error('Error parsing POML header:', error);
            }
          }
        }
      }
    }
    return blocks;
  }

  public getPrompt(
    fileName: string,
    blockName: string,
    replacements: Record<string, string | undefined> = {}
  ): string | undefined {
    const fileBlocks = this.prompts.get(fileName);
    if (!fileBlocks) return undefined;

    const block = fileBlocks.find(b => b.name === blockName);
    if (!block) return undefined;

    return this.replacePlaceholders(block.template, replacements);
  }

  private replacePlaceholders(text: string, replacements: Record<string, string | undefined>): string {
    let result = text;
    for (const key in replacements) {
      const placeholder = `{{${key}}}`;
      const value = replacements[key] || '';
      result = result.replace(new RegExp(placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), value);
    }
    return result;
  }
}

export const pomlService = new PomlService();
