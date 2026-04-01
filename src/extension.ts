import * as vscode from 'vscode';
import * as fs from 'fs';
import * as readline from 'readline';
import { HugoTagsHelperProvider, supportedTagsStart } from './HugoTagsHelperProvider';

export const knownBlogTagsKey = "knownBlogTags";
const blogTagsLastUpdatedKey = 'blogTagsLastUpdated';

export async function activate(context: vscode.ExtensionContext) {
	const outputChannel = vscode.window.createOutputChannel('Blog Tags Helper');
	context.subscriptions.push(outputChannel);
	outputChannel.appendLine('[BlogTagsHelper] Activating extension...');

	// Check if the extension is enabled
	const config = vscode.workspace.getConfiguration('blogTagsHelper');
	const isEnabled = config.get<boolean>('enable', true);
	
	if (!isEnabled) {
		outputChannel.appendLine('[BlogTagsHelper] Extension is disabled in settings');
		return;
	}
	outputChannel.appendLine('[BlogTagsHelper] Extension is enabled');

	const lastGenerated = context.workspaceState.get<Date>(blogTagsLastUpdatedKey, new Date(0));
	const currentDate = new Date();
	const lastWeek = new Date(currentDate.setDate(currentDate.getDate() - 7));
	outputChannel.appendLine(`[BlogTagsHelper] Last generated: ${lastGenerated}, checking if refresh needed`);
	if (lastGenerated < lastWeek) {
		outputChannel.appendLine('[BlogTagsHelper] Tags are stale, regenerating...');
		await generateTagList(context, outputChannel);
	} else {
		outputChannel.appendLine('[BlogTagsHelper] Tags are up to date');
	}

	context.subscriptions.push(
		vscode.commands.registerCommand("hugo-tags-helper.regenerateTags", async () => {
			outputChannel.appendLine('[BlogTagsHelper] Manual tag regeneration triggered');
			await generateTagList(context, outputChannel);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("hugo-tags-helper.test", async () => {
			const filePath = vscode.window.activeTextEditor?.document.uri.fsPath ?? '';
			outputChannel.appendLine(`[BlogTagsHelper] Test command triggered on file: ${filePath}`);
			const tagLines = await getTagsFromFile(filePath, outputChannel);
			const tags = parseTags(tagLines);
			outputChannel.appendLine(`[BlogTagsHelper] Test result - Tag lines: ${JSON.stringify(tagLines)}`);
			outputChannel.appendLine(`[BlogTagsHelper] Test result - Parsed tags: ${JSON.stringify(tags)}`);
		})
	);

	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider('markdown', new HugoTagsHelperProvider(context.workspaceState, outputChannel), '"', "'")
	);

	outputChannel.appendLine('[BlogTagsHelper] Extension activated successfully');
}

async function generateTagList(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
	const config = vscode.workspace.getConfiguration('blogTagsHelper');
	const fileGlobPattern = config.get<string>('fileGlobPattern', '**/index.md');
	outputChannel.appendLine(`[BlogTagsHelper] Generating tag list with pattern: ${fileGlobPattern}`);

	await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: "Finding blog tags...",
		cancellable: true,
	}, async (progress, token) => {
		token.onCancellationRequested(() => {
			console.log("User canceled the long running operation");
		});

		const files = await vscode.workspace.findFiles(fileGlobPattern);
		outputChannel.appendLine(`[BlogTagsHelper] Found ${files.length} files to process`);
		const allTags = new Set<string>();
		for (let f of files) {
			if (token.isCancellationRequested) {
				outputChannel.appendLine('[BlogTagsHelper] Operation cancelled by user');
				break;
			}
			const tagLines = await getTagsFromFile(f.fsPath, outputChannel);
			const tags = parseTags(tagLines);
			if (tags.length > 0) {
				outputChannel.appendLine(`[BlogTagsHelper] File ${f.fsPath}: Found ${tags.length} tags`);
			}
			tags.forEach(t => allTags.add(t));
		}

		const strings = Array.from(allTags);
		outputChannel.appendLine(`[BlogTagsHelper] Total unique tags found: ${strings.length}`);
		outputChannel.appendLine(`[BlogTagsHelper] Tags: ${strings.sort().join(', ')}`);
		await context.workspaceState.update(knownBlogTagsKey, strings);
		await context.workspaceState.update(blogTagsLastUpdatedKey, new Date());

		progress.report({message: 'Finished!'});
		outputChannel.appendLine('[BlogTagsHelper] Tag generation complete');
	});
}

export async function getTagsFromFile(filePath: string, outputChannel: vscode.OutputChannel): Promise<string[]> {
	const stream = fs.createReadStream(filePath);
	const readInterface = readline.createInterface(stream);
	let tagLines = [];
	let foundStart = false;
	let isYamlListFormat = false;
	try {
		let index = 0;
		for await (const line of readInterface) {
			if (index === 0 && !isAFrontmatterLine(line)) {
				// No frontmatter
				return [];
			} else if (index !== 0 && isAFrontmatterLine(line)) {
				// End of frontmatter, return what we found
				return tagLines;
			}

			const trimmed = line.trim();

			const isEnd = trimmed.includes(']');
			
			if (!foundStart && supportedTagsStart.some(x => trimmed.startsWith(x))) {
				foundStart = true;
				tagLines.push(trimmed);

				// If it's all one line (array format), just return now
				if (isEnd) {
					return tagLines;
				}
				
				// Check if it's YAML list format (tags: followed by newline)
				if (trimmed.endsWith(':') || !trimmed.includes('[')) {
					isYamlListFormat = true;
				}
				continue;
			}

			// If we found start and are in YAML list format
			if (foundStart && isYamlListFormat) {
				// YAML list items start with -
				if (trimmed.startsWith('-')) {
					tagLines.push(trimmed);
				} else if (trimmed.length > 0 && !trimmed.startsWith('#')) {
					// Non-empty line that's not a comment and doesn't start with - means end of list
					return tagLines;
				}
				index++;
				continue;
			}

			// End of the tags array (bracket format)
			if (isEnd) {
				tagLines.push(trimmed);
				return tagLines;
			}

			if (foundStart) {
				tagLines.push(trimmed);
			}

			index++;
		}
	}
	finally {
		stream.destroy(); // Destroy file stream.
	}

	return tagLines;
}

export function parseTags(lines: string[]): string[] {
	const tags = lines.flatMap(line => {
		// YAML list format: - TagName
		if (line.trim().startsWith('-')) {
			const tag = line.trim().substring(1).trim();
			return tag ? [tag] : [];
		}
		
		// Array format with quotes: ["tag1", "tag2"] or tags: ["tag1"]
		const matches = line.matchAll(/[\"\']([^\"\']*)[\"\']/g);
		return [...matches]
			.map(x => x[1])
			.filter(x => !!x)
			.map(x => x as string);
	});

	let distinctTags = new Set<string>(tags);
	return [...distinctTags];
}

// Only yaml or toml
function isAFrontmatterLine(line: string) {
	return line.includes('---') || line.includes('+++');
}