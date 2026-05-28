export type PolicyValidationError = {
	code: string;
	path: string;
	message: string;
};

export type PolicyValidationResult =
	| { ok: true; document: import("./types.js").PolicyDocument }
	| { ok: false; errors: PolicyValidationError[] };

export function policyError(code: string, path: string, message: string): PolicyValidationError {
	return { code, path, message };
}

export const POLICY_E001 = "POLICY_E001";
export const POLICY_E002 = "POLICY_E002";
export const POLICY_E003 = "POLICY_E003";
export const POLICY_E004 = "POLICY_E004";
export const POLICY_E005 = "POLICY_E005";
export const POLICY_E006 = "POLICY_E006";
export const POLICY_E007 = "POLICY_E007";
export const POLICY_E008 = "POLICY_E008";
export const POLICY_E009 = "POLICY_E009";
export const POLICY_E010 = "POLICY_E010";
export const POLICY_E011 = "POLICY_E011";
