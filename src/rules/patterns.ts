/** Built-in secret patterns — synthetic-test friendly, ASCII-oriented. */
export function builtInSecretPatterns(): RegExp[] {
	return [
		/sk-(?:proj-)?(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{8,}/g,
		/Bearer\s+\S+/g,
		/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
		/ghp_[A-Za-z0-9]{20,}/g,
		/github_pat_[A-Za-z0-9_]{20,}/g,
		/AKIA[0-9A-Z]{16}/g,
	];
}

export function emailPattern(): RegExp {
	return /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
}

export function phonePattern(): RegExp {
	return /\b(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
}
