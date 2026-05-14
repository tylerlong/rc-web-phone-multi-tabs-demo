const ports = new Set<MessagePort>();

type RequestMessage = {
	id: string;
	type: "ping" | "broadcast" | "disconnect";
	text?: string;
};

type ResponseMessage = {
	id: string;
	type: "connected" | "pong" | "broadcast";
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

		if (data.type === "broadcast") {
			for (const client of ports) {
				send(client, {
					type: "broadcast",
					text: data.text ?? "",
				});
			}
			return;
		}

		send(port, {
			type: "pong",
			text: `worker received: ${data.text ?? ""}`,
		});
	};

	port.start();
	send(port, { type: "connected", text: "worker connected" });
};
