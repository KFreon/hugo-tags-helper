import * as vscode from 'vscode';
import { knownBlogTagsKey } from './extension';

export const supportedTagsStart = ["tags:", "tags=", "tags ="];

const topLevelFrontmatterPropertyPattern = /^[A-Za-z0-9_-]+\s*[:=]/;

function getFrontmatterBounds(document: vscode.TextDocument): { start: number; end: number } | undefined {
	if (document.lineCount < 3) {
		return undefined;
	}

	const openingDelimiter = document.lineAt(0).text.trim();
	if (openingDelimiter !== '---' && openingDelimiter !== '+++') {
		return undefined;
	}

	for (let lineIndex = 1; lineIndex < document.lineCount; lineIndex++) {
		if (document.lineAt(lineIndex).text.trim() === openingDelimiter) {
			return { start: 0, end: lineIndex };
		}
	}

	return undefined;
}

export function isPositionInTagsFrontmatter(document: vscode.TextDocument, position: vscode.Position): boolean {
	const bounds = getFrontmatterBounds(document);
	if (!bounds || position.line <= bounds.start || position.line >= bounds.end) {
		return false;
	}

	let inYamlTags = false;
	let inArrayTags = false;

	for (let lineIndex = bounds.start + 1; lineIndex <= position.line; lineIndex++) {
		const lineText = document.lineAt(lineIndex).text;
		const trimmed = lineText.trim();

		if (inArrayTags) {
			if (lineIndex === position.line) {
				return !trimmed.startsWith(']');
			}

			if (trimmed.includes(']')) {
				inArrayTags = false;
			}

			continue;
		}

		if (topLevelFrontmatterPropertyPattern.test(lineText)) {
			inYamlTags = false;

			const trimmedStart = lineText.trimStart();
			const isTagsStart = supportedTagsStart.some((supportedStart) => trimmedStart.startsWith(supportedStart));
			if (!isTagsStart) {
				continue;
			}

			const openBracketIndex = lineText.indexOf('[');
			const closeBracketIndex = lineText.indexOf(']');
			if (openBracketIndex !== -1) {
				if (lineIndex === position.line) {
					return position.character > openBracketIndex && (closeBracketIndex === -1 || position.character <= closeBracketIndex);
				}

				inArrayTags = closeBracketIndex === -1;
				continue;
			}

			if (trimmedStart.endsWith(':')) {
				if (lineIndex === position.line) {
					return false;
				}

				inYamlTags = true;
			}

			continue;
		}

		if (!inYamlTags) {
			continue;
		}

		const trimmedStart = lineText.trimStart();
		if (lineIndex === position.line) {
			return trimmedStart.startsWith('-');
		}

		if (trimmed.length > 0 && !trimmedStart.startsWith('-') && !trimmedStart.startsWith('#')) {
			inYamlTags = false;
		}
	}

	return false;
}

export class HugoTagsHelperProvider implements vscode.CompletionItemProvider {
	private workspaceState: vscode.Memento;
	private outputChannel: vscode.OutputChannel;

	constructor(state: vscode.Memento, outputChannel: vscode.OutputChannel) {
		this.workspaceState = state;
		this.outputChannel = outputChannel;
	}

	provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
		this.outputChannel.appendLine(`[BlogTagsHelper] Completion requested at line ${position.line}, character ${position.character}`);
		
		// Only consider the top few lines
		if (position.line > 100) {
			this.outputChannel.appendLine(`[BlogTagsHelper] Position beyond line 100, skipping`);
			return [];
		}

		if (!isPositionInTagsFrontmatter(document, position)) {
			this.outputChannel.appendLine('[BlogTagsHelper] Position is outside the tags section in frontmatter, skipping');
			return [];
		}

		const tags = this.workspaceState.get<string[]>(knownBlogTagsKey, []);
		this.outputChannel.appendLine(`[BlogTagsHelper] Providing ${tags.length} tag completions: ${tags.join(', ')}`);
		const completionItems = tags.map(t => new vscode.CompletionItem(t, vscode.CompletionItemKind.Enum));
		return Promise.resolve(completionItems);
	}
}
