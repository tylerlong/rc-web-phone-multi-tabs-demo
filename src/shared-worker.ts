import { DefaultSipClient } from "ringcentral-web-phone/sip-client";
import type OutboundMessage from "ringcentral-web-phone/sip-message/outbound/index";

const ports = new Set<MessagePort>();

type PortMessage = string | { type: "disconnect" };

const worker = self as unknown as {
	onconnect: ((event: MessageEvent) => void) | null;
};

worker.onconnect = (event: MessageEvent) => {
	const port = event.ports?.[0];
	if (!port) return;

	ports.add(port);

	port.onmessage = (messageEvent: MessageEvent<PortMessage>) => {
		const data = messageEvent.data;

		if (typeof data !== "string" && data.type === "disconnect") {
			ports.delete(port);
			port.close();
			return;
		}

		sipClient.send(data as unknown as OutboundMessage);
	};

	port.start();
};

const sipClient = new DefaultSipClient({
	sipInfo: JSON.parse(import.meta.env.VITE_SIP_INFO),
});
sipClient.on("inboundMessage", (message) => {
	for (const client of ports) {
		client.postMessage(message);
	}
});
sipClient.start();
