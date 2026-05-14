import { useEffect, useMemo, useRef, useState } from "react";

type RequestMessage = {
	type: "ping" | "broadcast" | "disconnect";
	tabId: string;
	text?: string;
};

type ResponseMessage = {
	type: "connected" | "pong" | "broadcast" | "error";
	tabId: string;
	text: string;
};

export default function App() {
	const [messages, setMessages] = useState<string[]>([]);
	const tabId = useRef(crypto.randomUUID());
	const worker = useMemo(
		() =>
			new SharedWorker(new URL("./shared-worker.ts", import.meta.url), {
				type: "module",
			}),
		[],
	);

	useEffect(() => {
		const { port } = worker;
		port.start();

		port.onmessage = (event: MessageEvent<ResponseMessage>) => {
			const data = event.data;
			setMessages((prev) => [
				...prev,
				`from worker [${data.type}] (${data.tabId}) ${data.text}`,
			]);
		};

		port.postMessage({
			type: "ping",
			tabId: tabId.current,
			text: "hello from app",
		} satisfies RequestMessage);

		return () => {
			port.postMessage({
				type: "disconnect",
				tabId: tabId.current,
			} satisfies RequestMessage);
		};
	}, [worker]);

	const send = (type: "ping" | "broadcast") => {
		const text = `${type} ${new Date().toISOString()}`;
		setMessages((prev) => [...prev, `to worker [${type}] ${text}`]);
		worker.port.postMessage({
			type,
			tabId: tabId.current,
			text,
		} satisfies RequestMessage);
	};

	return (
		<div>
			<h1>SharedWorker demo</h1>
			<p>tabId: {tabId.current}</p>
			<button onClick={() => send("ping")} type="button">
				Send Ping (reply to this tab only)
			</button>
			<button onClick={() => send("broadcast")} type="button">
				Send Broadcast (all tabs)
			</button>
			<ul>
				{messages.map((message, index) => (
					<li key={`${index}-${message}`}>{message}</li>
				))}
			</ul>
		</div>
	);
}
