import { DefaultSipClient } from "ringcentral-web-phone/sip-client";
import type OutboundMessage from "ringcentral-web-phone/sip-message/outbound/index";

const ports = new Set<MessagePort>();

type RequestMessage = {
	id: string;
	type: "message" | "disconnect";
	text?: string;
};

const worker = self as unknown as {
	onconnect: ((event: MessageEvent) => void) | null;
};

worker.onconnect = (event: MessageEvent) => {
	const port = event.ports?.[0];
	if (!port) return;

	ports.add(port);

	port.onmessage = (messageEvent: MessageEvent<RequestMessage>) => {
		const data = messageEvent.data;

		if (data.type === "disconnect") {
			ports.delete(port);
			port.close();
			return;
		}

		// forward browser tabs messages to SIP server
		console.log("forward browser tabs messages to SIP server:", data);
		sipClient.send(data as unknown as OutboundMessage, false);
	};

	port.start();
};

const sipClient = new DefaultSipClient({
	sipInfo: JSON.parse(import.meta.env.VITE_SIP_INFO),
});
sipClient.on("inboundMessage", (message) => {
	console.log("forward SIP server messages to browser tabs:", message);
	// forward SIP server messages to browser tabs
	for (const client of ports) {
		client.postMessage(message);
	}
});
sipClient.start();
