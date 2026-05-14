import { useCallback, useEffect, useRef, useState } from "react";

type RequestMessage = {
	id: string;
	type: "message" | "disconnect";
	text?: string;
};

type ResponseMessage = {
	id: string;
	type: "message";
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
					text: `from worker ${data.text}`,
				},
			]);
		};

		return () => {
			postMessage({
				type: "disconnect",
			});
			port.close();
			portRef.current = null;
		};
	}, [postMessage]);

	const send = () => {
		const text = new Date().toISOString();
		const message = postMessage({
			type: "message",
			text,
		});
		setMessages((prev) => [
			...prev,
			{ id: message.id, text: `to worker ${text}` },
		]);
	};

	return (
		<div>
			<h1>SharedWorker demo</h1>
			<button onClick={send} type="button">
				Send Message
			</button>
			<ul>
				{messages.map((message) => (
					<li key={message.id}>{message.text}</li>
				))}
			</ul>
		</div>
	);
}
