const ports = new Set<MessagePort>();

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

const worker = self as unknown as {
	onconnect: ((event: MessageEvent) => void) | null;
};

worker.onconnect = (event: MessageEvent) => {
	const port = event.ports?.[0];
	if (!port) return;

	ports.add(port);

	const send = (target: MessagePort, payload: Omit<ResponseMessage, "id">) => {
		target.postMessage({
			...payload,
			id: crypto.randomUUID(),
		} satisfies ResponseMessage);
	};

	port.onmessage = (messageEvent: MessageEvent<RequestMessage>) => {
		const data = messageEvent.data;

		if (data.type === "disconnect") {
			ports.delete(port);
			port.close();
			return;
		}

		for (const client of ports) {
			send(client, {
				type: "message",
				text: data.text ?? "",
			});
		}
	};

	port.start();
};
