import { readStructuredFile } from "../shared/structured-file.js";

export type ManifestValidationError = { path: string; message: string };

/** Zero-dep manifest validation (schemas/tools-manifest-v1.json is documentation mirror). */
export function validateManifestDocument(doc: unknown): ManifestValidationError[] {
	const errors: ManifestValidationError[] = [];
	if (!doc || typeof doc !== "object") {
		errors.push({ path: "", message: "Manifest must be a JSON object" });
		return errors;
	}
	const record = doc as Record<string, unknown>;
	if (record.version !== "1") {
		errors.push({ path: "version", message: 'Expected version "1"' });
	}
	if (!Array.isArray(record.tools)) {
		errors.push({ path: "tools", message: "tools must be an array" });
		return errors;
	}
	if (record.tools.length === 0) {
		errors.push({ path: "tools", message: "tools must not be empty" });
	}
	record.tools.forEach((t, i) => {
		if (!t || typeof t !== "object") {
			errors.push({ path: `tools[${i}]`, message: "tool entry must be an object" });
			return;
		}
		const name = (t as Record<string, unknown>).name;
		if (typeof name !== "string" || name.length === 0) {
			errors.push({ path: `tools[${i}].name`, message: "name must be a non-empty string" });
		}
	});
	return errors;
}

/** Validate manifest file on disk. */
export function validateManifestFile(filePath: string): ManifestValidationError[] {
	try {
		return validateManifestDocument(readStructuredFile(filePath));
	} catch (err) {
		return [{ path: "", message: String(err) }];
	}
}
