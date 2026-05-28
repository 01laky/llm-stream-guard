/**
 * Minimal ambient module stubs for cookbook examples — no Hono/Express npm installs.
 * Event unions live in stub-events.ts so this file stays ambient (no top-level export).
 */

declare module "hono" {
	export type Context = {
		req: Request;
		json: (body: unknown, status?: number) => Response;
	};
	export type Hono = {
		get: (path: string, handler: (c: Context) => Response | Promise<Response>) => Hono;
	};
	export function Hono(): Hono;
}

declare module "express" {
	export type Request = { method: string; url: string };
	export type Response = {
		setHeader: (name: string, value: string) => void;
		status: (code: number) => Response;
		json: (body: unknown) => void;
		send: (body: unknown) => void;
		pipe: (dest: unknown) => void;
	};
	export type NextFunction = () => void;
	export type RequestHandler = (req: Request, res: Response, next: NextFunction) => void;
	export interface Express {
		get: (path: string, handler: RequestHandler) => void;
		listen: (port: number, cb?: () => void) => void;
	}
	export default function express(): Express;
}
