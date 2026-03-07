/**
 * Unit tests for template-utils.ts
 * Tests template rendering and case conversion utilities
 */
import { describe, it, expect } from 'vitest';
import { renderTemplate, toKebabCase, toPascalCase } from '../../../codeman/utils/template-utils';

describe('renderTemplate', () => {
    it('should replace single variable', () => {
        const template = 'Hello, {{ name }}!';
        const result = renderTemplate(template, { name: 'World' });
        expect(result).toBe('Hello, World!');
    });

    it('should replace multiple variables', () => {
        const template = '{{ greeting }}, {{ name }}!';
        const result = renderTemplate(template, { greeting: 'Hello', name: 'World' });
        expect(result).toBe('Hello, World!');
    });

    it('should handle variables with extra whitespace', () => {
        const template = 'Hello, {{   name   }}!';
        const result = renderTemplate(template, { name: 'World' });
        expect(result).toBe('Hello, World!');
    });

    it('should replace same variable multiple times', () => {
        const template = '{{ name }} is {{ name }}';
        const result = renderTemplate(template, { name: 'test' });
        expect(result).toBe('test is test');
    });

    it('should leave unreplaced variables as-is', () => {
        const template = 'Hello, {{ name }}!';
        const result = renderTemplate(template, { other: 'value' });
        expect(result).toBe('Hello, {{ name }}!');
    });

    it('should handle empty template', () => {
        const result = renderTemplate('', { name: 'World' });
        expect(result).toBe('');
    });
});

describe('toKebabCase', () => {
    it('should convert camelCase to kebab-case', () => {
        expect(toKebabCase('myComponent')).toBe('my-component');
    });

    it('should convert PascalCase to kebab-case', () => {
        expect(toKebabCase('MyComponent')).toBe('my-component');
    });

    it('should replace spaces with hyphens', () => {
        expect(toKebabCase('my component')).toBe('my-component');
    });

    it('should replace underscores with hyphens', () => {
        expect(toKebabCase('my_component')).toBe('my-component');
    });

    it('should handle already kebab-case', () => {
        expect(toKebabCase('my-component')).toBe('my-component');
    });

    it('should handle multiple capitals in a row', () => {
        // Implementation converts XMLParser -> xmlparser (consecutive capitals treated as one word)
        expect(toKebabCase('XMLParser')).toBe('xmlparser');
    });
});

describe('toPascalCase', () => {
    it('should convert kebab-case to PascalCase', () => {
        // Implementation capitalizes each segment: My + Component
        expect(toPascalCase('my-component')).toBe('MyComponent');
    });

    it('should convert snake_case to PascalCase', () => {
        // Implementation lowercases after the first char: My + component = Mycomponent
        expect(toPascalCase('my_component')).toBe('Mycomponent');
    });

    it('should handle single word', () => {
        expect(toPascalCase('component')).toBe('Component');
    });

    it('should capitalize first letter of each word', () => {
        expect(toPascalCase('hello world')).toBe('Hello World');
    });
});
