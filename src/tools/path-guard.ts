import path from "node:path";

/**
 * Resolves `candidatePath` against `root` — absolute paths pass through
 * path.resolve's own "absolute wins" semantics, so both relative and
 * absolute inputs are handled by the same lexical resolution — and returns
 * the resolved absolute path only if it stays inside `root` (root itself and
 * any nested subdirectory both count as inside). Returns null when the
 * resolved path escapes root, e.g. via "../" traversal or an absolute path
 * pointing elsewhere.
 *
 * Purely lexical (path.resolve/path.relative, no filesystem access) — it
 * does not follow symlinks, so a symlink inside root that points outside it
 * is not caught here.
 */
export function resolveWithinRoot(
	candidatePath: string,
	root: string = process.cwd(),
): string | null {
	const resolvedRoot = path.resolve(root);
	const resolvedCandidate = path.resolve(resolvedRoot, candidatePath);
	const relative = path.relative(resolvedRoot, resolvedCandidate);

	if (relative === "") {
		return resolvedCandidate;
	}
	const firstSegment = relative.split(path.sep)[0];
	const escapes = firstSegment === "..";
	const isAbsoluteOnAnotherRoot = path.isAbsolute(relative);
	if (escapes || isAbsoluteOnAnotherRoot) {
		return null;
	}
	return resolvedCandidate;
}

export function isPathWithinRoot(
	candidatePath: string,
	root: string = process.cwd(),
): boolean {
	return resolveWithinRoot(candidatePath, root) !== null;
}
