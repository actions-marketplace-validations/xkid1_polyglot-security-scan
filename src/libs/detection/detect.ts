import path from 'node:path';

import { LANGUAGES, languageOf } from './languages';
import { ecosystemOf } from './manifests';

import type { DetectResult, LanguageId } from '@types';

/**
 * Count languages and collect package manifests from a list of repository-relative
 * files. Pure: it never touches the file system.
 */
export function detect(files: readonly string[]): DetectResult {
  const languageCounts = new Map<LanguageId, number>();
  const manifests = new Map<string, string[]>();

  for (const file of files) {
    const language = languageOf(file);
    if (language) languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);

    const ecosystem = ecosystemOf(path.basename(file));
    if (ecosystem) {
      const list = manifests.get(ecosystem) ?? [];
      list.push(file);
      manifests.set(ecosystem, list);
    }
  }

  // TypeScript projects almost always contain some .js config too; both are reported.
  const languages = [...languageCounts]
    .map(([id, count]) => ({ id, name: LANGUAGES[id].name, files: count }))
    .sort((a, b) => b.files - a.files);
  const ecosystems = [...manifests].map(([name, list]) => ({ name, manifests: list }));
  return { languages, ecosystems };
}
