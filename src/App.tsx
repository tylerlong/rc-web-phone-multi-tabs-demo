import { useEffect, useRef, useState } from "react";

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

type MessageItem = {
	id: string;
	text: string;
};

export default function App() {
	const [messages, setMessages] = useState<MessageItem[]>([]);
	const tabId = useRef(crypto.randomUUID());
	const portRef = useRef<MessagePort | null>(null);

	useEffect(() => {
		const worker = new SharedWorker(
			new URL("./shared-worker.ts", import.meta.url),
			{ type: "module" },
		);
		const { port } = worker;
		portRef.current = port;
		port.start();

		port.onmessage = (event: MessageEvent<ResponseMessage>) => {
			const data = event.data;
			setMessages((prev) => [
				...prev,
				{
					id: crypto.randomUUID(),
					text: `from worker [${data.type}] (${data.tabId}) ${data.text}`,
				},
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
			port.close();
			portRef.current = null;
		};
	}, []);

	const send = (type: "ping" | "broadcast") => {
		const text = `${type} ${new Date().toISOString()}`;
		setMessages((prev) => [
			...prev,
			{ id: crypto.randomUUID(), text: `to worker [${type}] ${text}` },
		]);
		portRef.current?.postMessage({
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
				{messages.map((message) => (
					<li key={message.id}>{message.text}</li>
				))}
			</ul>
		</div>
	);
}
