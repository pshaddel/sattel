const SPINNER_FRAMES = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];

export function startSpinner(
	onFrame: (frame: string) => void,
	intervalMs = 80,
): () => void {
	let frame = 0;
	const timer = setInterval(() => {
		frame = (frame + 1) % SPINNER_FRAMES.length;
		onFrame(SPINNER_FRAMES[frame]);
	}, intervalMs);
	return () => clearInterval(timer);
}
