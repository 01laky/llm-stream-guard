/** Emit a GitHub Actions workflow annotation for a scan/audit finding. */
export function annotateFinding(f: {
	file: string;
	line?: number;
	message: string;
	severity: string;
}): void {
	const line = f.line ?? 1;
	const level = f.severity === "error" ? "error" : "warning";
	console.log(`::${level} file=${f.file},line=${line}::${f.message}`);
}
