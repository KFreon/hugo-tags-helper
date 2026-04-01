import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { getTagsFromFile, parseTags } from '../extension';
import { isPositionInTagsFrontmatter } from '../HugoTagsHelperProvider';

// Mock output channel for tests
class MockOutputChannel implements vscode.OutputChannel {
	name: string = 'Test';
	append(value: string): void { }
	appendLine(value: string): void { }
	clear(): void { }
	show(preserveFocus?: boolean): void;
	show(column?: vscode.ViewColumn, preserveFocus?: boolean): void;
	show(column?: any, preserveFocus?: any): void { }
	hide(): void { }
	dispose(): void { }
	replace(value: string): void { }
}

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Configuration defaults are correct', () => {
		const config = vscode.workspace.getConfiguration('blogTagsHelper');
		const enable = config.inspect<boolean>('enable');
		const fileGlobPattern = config.inspect<string>('fileGlobPattern');
		
		// Check that defaults are what we expect
		assert.strictEqual(enable?.defaultValue, true, 'enable should default to true');
		assert.strictEqual(fileGlobPattern?.defaultValue, '**/index.md', 'fileGlobPattern should default to **/index.md');
	});

	suite('parseTags', () => {
		test('should parse YAML list format tags', () => {
			const lines = [
				'tags:',
				'- Hardware',
				'- Work'
			];
			const tags = parseTags(lines);
			assert.deepStrictEqual(tags.sort(), ['Hardware', 'Work']);
		});

		test('should parse array format tags with double quotes', () => {
			const lines = ['tags: ["Hardware", "Work"]'];
			const tags = parseTags(lines);
			assert.deepStrictEqual(tags.sort(), ['Hardware', 'Work']);
		});

		test('should parse array format tags with single quotes', () => {
			const lines = ["tags: ['Hardware', 'Work']"];
			const tags = parseTags(lines);
			assert.deepStrictEqual(tags.sort(), ['Hardware', 'Work']);
		});

		test('should parse multiline array format', () => {
			const lines = [
				'tags: [',
				'"Hardware",',
				'"Work"',
				']'
			];
			const tags = parseTags(lines);
			assert.deepStrictEqual(tags.sort(), ['Hardware', 'Work']);
		});

		test('should handle empty YAML list items', () => {
			const lines = [
				'tags:',
				'-',
				'- Hardware'
			];
			const tags = parseTags(lines);
			assert.deepStrictEqual(tags, ['Hardware']);
		});

		test('should deduplicate tags', () => {
			const lines = [
				'tags:',
				'- Hardware',
				'- Work',
				'- Hardware'
			];
			const tags = parseTags(lines);
			assert.deepStrictEqual(tags.sort(), ['Hardware', 'Work']);
		});

		test('should handle tags with spaces', () => {
			const lines = [
				'tags:',
				'- Machine Learning',
				'- Data Science'
			];
			const tags = parseTags(lines);
			assert.deepStrictEqual(tags.sort(), ['Data Science', 'Machine Learning']);
		});
	});

	suite('getTagsFromFile', () => {
		let tempDir: string;
		let mockOutputChannel: vscode.OutputChannel;

		setup(() => {
			tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-tags-test-'));
			mockOutputChannel = new MockOutputChannel();
		});

		teardown(() => {
			// Clean up temp files
			if (fs.existsSync(tempDir)) {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});

		test('should extract tags from YAML list format', async () => {
			const content = `---
title: Test Post
date: '2025-04-21T15:00:00.000+09:30'
tags:
- Hardware
- Work
---

Post content here`;
			
			const filePath = path.join(tempDir, 'test1.md');
			fs.writeFileSync(filePath, content);

			const tagLines = await getTagsFromFile(filePath, mockOutputChannel);
			const tags = parseTags(tagLines);
			
			assert.deepStrictEqual(tags.sort(), ['Hardware', 'Work']);
		});

		test('should extract tags from array format with colon', async () => {
			const content = `---
title: Test Post
tags: ["Hardware", "Work"]
---

Post content here`;
			
			const filePath = path.join(tempDir, 'test2.md');
			fs.writeFileSync(filePath, content);

			const tagLines = await getTagsFromFile(filePath, mockOutputChannel);
			const tags = parseTags(tagLines);
			
			assert.deepStrictEqual(tags.sort(), ['Hardware', 'Work']);
		});

		test('should extract tags from array format with equals', async () => {
			const content = `+++
title = "Test Post"
tags = ["Hardware", "Work"]
+++

Post content here`;
			
			const filePath = path.join(tempDir, 'test3.md');
			fs.writeFileSync(filePath, content);

			const tagLines = await getTagsFromFile(filePath, mockOutputChannel);
			const tags = parseTags(tagLines);
			
			assert.deepStrictEqual(tags.sort(), ['Hardware', 'Work']);
		});

		test('should handle multiline array format', async () => {
			const content = `---
title: Test Post
tags: [
  "Hardware",
  "Work"
]
---

Post content here`;
			
			const filePath = path.join(tempDir, 'test4.md');
			fs.writeFileSync(filePath, content);

			const tagLines = await getTagsFromFile(filePath, mockOutputChannel);
			const tags = parseTags(tagLines);
			
			assert.deepStrictEqual(tags.sort(), ['Hardware', 'Work']);
		});

		test('should return empty array for file without frontmatter', async () => {
			const content = `# Test Post

No frontmatter here`;
			
			const filePath = path.join(tempDir, 'test5.md');
			fs.writeFileSync(filePath, content);

			const tagLines = await getTagsFromFile(filePath, mockOutputChannel);
			const tags = parseTags(tagLines);
			
			assert.deepStrictEqual(tags, []);
		});

		test('should return empty array for frontmatter without tags', async () => {
			const content = `---
title: Test Post
date: 2025-04-21
---

Post content here`;
			
			const filePath = path.join(tempDir, 'test6.md');
			fs.writeFileSync(filePath, content);

			const tagLines = await getTagsFromFile(filePath, mockOutputChannel);
			const tags = parseTags(tagLines);
			
			assert.deepStrictEqual(tags, []);
		});

		test('should handle YAML list with extra whitespace', async () => {
			const content = `---
title: Test Post
tags:
  - Hardware
  - Work
---

Post content here`;
			
			const filePath = path.join(tempDir, 'test7.md');
			fs.writeFileSync(filePath, content);

			const tagLines = await getTagsFromFile(filePath, mockOutputChannel);
			const tags = parseTags(tagLines);
			
			assert.deepStrictEqual(tags.sort(), ['Hardware', 'Work']);
		});

		test('should stop at next property in YAML list format', async () => {
			const content = `---
title: Test Post
tags:
- Hardware
- Work
description: Some description
---

Post content here`;
			
			const filePath = path.join(tempDir, 'test8.md');
			fs.writeFileSync(filePath, content);

			const tagLines = await getTagsFromFile(filePath, mockOutputChannel);
			const tags = parseTags(tagLines);
			
			assert.deepStrictEqual(tags.sort(), ['Hardware', 'Work']);
		});

		test('should handle the example from issue', async () => {
			const content = `---
title: Edifier MR4 Powered Studio Monitor Speakers
date: '2025-04-21T15:00:00.000+09:30'
image: ../../assets/2025/04/edifier-rear-view.jpg
imageAlt: Rear view of speaker showing input jacks and bass/treble knobs
description: |
    Adding some external speakers to my work desk, and what I thought of the Edifier MR4
    Powered Studio Monitor speakers.
tags:
- Hardware
- Work
---

Post content`;
			
			const filePath = path.join(tempDir, 'issue-example.md');
			fs.writeFileSync(filePath, content);

			const tagLines = await getTagsFromFile(filePath, mockOutputChannel);
			const tags = parseTags(tagLines);
			
			assert.deepStrictEqual(tags.sort(), ['Hardware', 'Work']);
		});
	});

	suite('isPositionInTagsFrontmatter', () => {
		function createDocument(content: string): vscode.TextDocument {
			const lines = content.split(/\r?\n/);
			return {
				lineCount: lines.length,
				lineAt(lineOrPosition: number | vscode.Position): vscode.TextLine {
					const lineNumber = typeof lineOrPosition === 'number' ? lineOrPosition : lineOrPosition.line;
					return {
						lineNumber,
						text: lines[lineNumber],
						range: new vscode.Range(lineNumber, 0, lineNumber, lines[lineNumber].length),
						rangeIncludingLineBreak: new vscode.Range(lineNumber, 0, lineNumber, lines[lineNumber].length),
						firstNonWhitespaceCharacterIndex: lines[lineNumber].search(/\S|$/),
						isEmptyOrWhitespace: lines[lineNumber].trim().length === 0
					};
				}
			} as vscode.TextDocument;
		}

		function positionForSubstring(content: string, substring: string): { document: vscode.TextDocument; position: vscode.Position } {
			const offset = content.indexOf(substring);
			assert.notStrictEqual(offset, -1, `Expected to find substring: ${substring}`);

			const document = createDocument(content);
			const contentBeforePosition = content.slice(0, offset + substring.length);
			const linesBeforePosition = contentBeforePosition.split(/\r?\n/);
			return {
				document,
				position: new vscode.Position(linesBeforePosition.length - 1, linesBeforePosition[linesBeforePosition.length - 1].length)
			};
		}

		test('returns true for YAML tag entries inside frontmatter', () => {
			const content = `---
title: Example
tags:
- 'Hardw'
---

Body content`;

			const { document, position } = positionForSubstring(content, "- 'Hardw'");
			assert.strictEqual(isPositionInTagsFrontmatter(document, position), true);
		});

		test('returns true for inline tag arrays inside frontmatter', () => {
			const content = `---
title: Example
tags: ['Hardw']
---`;

			const { document, position } = positionForSubstring(content, "['Hardw'");
			assert.strictEqual(isPositionInTagsFrontmatter(document, position), true);
		});

		test('returns false for quotes in markdown body after frontmatter tags', () => {
			const content = `---
title: Example
tags: ['Hardware']
---

This paragraph has a 'quote' in it.`;

			const { document, position } = positionForSubstring(content, "'quote'");
			assert.strictEqual(isPositionInTagsFrontmatter(document, position), false);
		});

		test('returns false for other frontmatter properties', () => {
			const content = `---
title: 'Example'
description: 'A quoted description'
tags: ['Hardware']
---`;

			const { document, position } = positionForSubstring(content, "'A quoted description'");
			assert.strictEqual(isPositionInTagsFrontmatter(document, position), false);
		});
	});
});
