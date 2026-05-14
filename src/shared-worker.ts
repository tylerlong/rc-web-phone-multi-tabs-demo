const ports = new Set<MessagePort>();

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

const worker = self as unknown as {
	onconnect: ((event: MessageEvent) => void) | null;
};

worker.onconnect = (event: MessageEvent) => {
	const port = event.ports?.[0];
	if (!port) return;

	ports.add(port);

	const send = (target: MessagePort, payload: ResponseMessage) => {
		target.postMessage(payload);
	};

	port.onmessage = (messageEvent: MessageEvent<RequestMessage>) => {
		const data = messageEvent.data;

		if (!data?.tabId || !data.type) {
			send(port, { type: "error", tabId: "unknown", text: "invalid request" });
			return;
		}

		if (data.type === "disconnect") {
			ports.delete(port);
			port.close();
			return;
		}

		if (data.type === "broadcast") {
			for (const client of ports) {
				send(client, {
					type: "broadcast",
					tabId: data.tabId,
					text: data.text ?? "",
				});
			}
			return;
		}

		send(port, {
			type: "pong",
			tabId: data.tabId,
			text: `worker received: ${data.text ?? ""}`,
		});
	};

	port.onmessageerror = () => {
		send(port, {
			type: "error",
			tabId: "unknown",
			text: "message parse error",
		});
	};

	port.start();
	send(port, { type: "connected", tabId: "worker", text: "worker connected" });
};
