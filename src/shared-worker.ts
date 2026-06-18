import { DefaultSipClient } from "ringcentral-web-phone/sip-client";
import type InboundMessage from "ringcentral-web-phone/sip-message/inbound";
import type OutboundMessage from "ringcentral-web-phone/sip-message/outbound/index";

const ports = new Set<MessagePort>();
const callOwners = new Map<string, MessagePort>();

type PortMessage =
	| string
	| { type: "disconnect" }
	| { type: "associateCallId"; callId: string }
	| { type: "releaseCallId"; callId: string };

const callIdFromSipString = (message: string) =>
	message.match(/^Call-Id:\s*(.+)$/im)?.[1]?.trim();

const disconnect = (port: MessagePort) => {
	ports.delete(port);
	for (const [callId, owner] of callOwners) {
		if (owner === port) callOwners.delete(callId);
	}
	port.close();
};

const associateCallId = (port: MessagePort, callId: string) => {
	if (!callId || callOwners.has(callId)) return;
	callOwners.set(callId, port);
	for (const client of ports) {
		if (client !== port) client.postMessage({ type: "callClaimed", callId });
	}
};

const releaseCallId = (port: MessagePort, callId: string) => {
	if (callOwners.get(callId) === port) callOwners.delete(callId);
};

const routeInboundMessage = (message: InboundMessage) => {
	const owner = callOwners.get(message.headers["Call-Id"]);
	for (const client of owner ? [owner] : ports) {
		client.postMessage(message);
	}
};

const worker = self as unknown as {
	onconnect: ((event: MessageEvent) => void) | null;
};

worker.onconnect = (event: MessageEvent) => {
	const port = event.ports?.[0];
	if (!port) return;

	ports.add(port);

	port.onmessage = (messageEvent: MessageEvent<PortMessage>) => {
		const data = messageEvent.data;

		if (typeof data !== "string") {
			if (data.type === "disconnect") disconnect(port);
			if (data.type === "associateCallId") associateCallId(port, data.callId);
			if (data.type === "releaseCallId") releaseCallId(port, data.callId);
			return;
		}

		const owner = callOwners.get(callIdFromSipString(data) ?? "");
		if (owner && owner !== port) return;

		sipClient.send(data as unknown as OutboundMessage);
	};

	port.start();
};

const sipClient = new DefaultSipClient({
	sipInfo: JSON.parse(import.meta.env.VITE_SIP_INFO),
});
sipClient.on("inboundMessage", (message) => {
	routeInboundMessage(message);
});
sipClient.start();
