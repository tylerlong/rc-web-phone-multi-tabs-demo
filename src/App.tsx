import { useCallback, useEffect, useRef, useState } from "react";

type RequestMessage = {
	id: string;
	type: "ping" | "broadcast" | "disconnect";
	text?: string;
};

type ResponseMessage = {
	id: string;
	type: "connected" | "pong" | "broadcast" | "error";
	text: string;
};

type MessageItem = {
	id: string;
	text: string;
};

type OutboundMessage = Omit<RequestMessage, "id">;

export default function App() {
	const [messages, setMessages] = useState<MessageItem[]>([]);
	const portRef = useRef<MessagePort | null>(null);

	const postMessage = useCallback((payload: OutboundMessage) => {
		const message = {
			...payload,
			id: crypto.randomUUID(),
		} satisfies RequestMessage;
		portRef.current?.postMessage(message);
		return message;
	}, []);

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
					id: data.id,
					text: `from worker [${data.type}] ${data.text}`,
				},
			]);
		};

		postMessage({
			type: "ping",
			text: "hello from app",
		});

		return () => {
			postMessage({
				type: "disconnect",
			});
			port.close();
			portRef.current = null;
		};
	}, [postMessage]);

	const send = (type: "ping" | "broadcast") => {
		const text = `${type} ${new Date().toISOString()}`;
		const message = postMessage({
			type,
			text,
		});
		setMessages((prev) => [
			...prev,
			{ id: message.id, text: `to worker [${type}] ${text}` },
		]);
	};

	return (
		<div>
			<h1>SharedWorker demo</h1>
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
