/** Byte split enumeration for LSG-XEC1201+ matrix tests. */
import { utf8 } from "./streams.js";

export type ByteSplitCase = {
	id: string;
	label: string;
	secret: string;
	leak: string;
	payload: Uint8Array;
};

export function buildSecretPayload(prefix: string, secret: string, suffix: string): Uint8Array {
	return utf8(`${prefix}${secret}${suffix}`);
}

/** Standard synthetic secrets for split matrix (sk-test style only). */
export const MATRIX_SECRETS: Array<Omit<ByteSplitCase, "payload">> = [
	{
		id: "sk-test",
		label: "sk-test",
		secret: "sk-test123456789012345678901234567890",
		leak: "sk-test123456789012345678901234567890",
	},
	{
		id: "sk-proj",
		label: "sk-proj",
		secret: "sk-proj-1234567890abcdefghij",
		leak: "sk-proj-1234567890",
	},
	{
		id: "ghp",
		label: "ghp_",
		secret: "ghp_1234567890abcdefghij1234567890ab",
		leak: "ghp_1234567890",
	},
	{
		id: "github_pat",
		label: "github_pat_",
		secret: "github_pat_1234567890abcdefghij1234567890ab",
		leak: "github_pat_",
	},
	{
		id: "akia",
		label: "AKIA",
		secret: "AKIAIOSFODNN7EXAMPLE",
		leak: "AKIAIOSFODNN7EXAMPLE",
	},
	{
		id: "jwt",
		label: "JWT",
		secret:
			"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
		leak: "eyJhbGci",
	},
	{
		id: "bearer",
		label: "Bearer",
		secret: "Bearer sk-test123456789012345678901234567890",
		leak: "Bearer",
	},
	{
		id: "sk-mid",
		label: "sk-mid",
		secret: "sk-test-abcdef1234567890",
		leak: "sk-test-abcdef",
	},
	{
		id: "ghp-short",
		label: "ghp_short",
		secret: "ghp_abcdefghijklmnopqrst",
		leak: "ghp_abcdefghijkl",
	},
	{
		id: "data-sk",
		label: "data-sk",
		secret: "sk-test987654321098765432109876543210",
		leak: "sk-test9876543210",
	},
];

export function byteSplitCases(): ByteSplitCase[] {
	return MATRIX_SECRETS.map((c) => ({
		...c,
		payload: buildSecretPayload("prefix ", c.secret, " suffix"),
	}));
}

export function* splitIndicesForLength(length: number): Generator<number> {
	for (let i = 0; i <= length; i++) yield i;
}

export function expectedByteSplitTestCount(): number {
	let n = 0;
	for (const c of byteSplitCases()) n += c.payload.length + 1;
	return n;
}
