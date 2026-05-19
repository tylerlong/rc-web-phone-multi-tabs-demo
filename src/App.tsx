import { useEffect, useState } from "react";
import WebPhone from "ringcentral-web-phone";
import type InboundCallSession from "ringcentral-web-phone/call-session/inbound";
import EventEmitter from "ringcentral-web-phone/event-emitter";
import type InboundMessage from "ringcentral-web-phone/sip-message/inbound";
import type RequestMessage from "ringcentral-web-phone/sip-message/outbound/request";
import type ResponseMessage from "ringcentral-web-phone/sip-message/outbound/response";
import type { SipClient } from "ringcentral-web-phone/types";

class MySipClient extends EventEmitter implements SipClient {
	private port: MessagePort | null = null;
	public async start() {
		if (this.port !== null) return;
		const worker = new SharedWorker(
			new URL("./shared-worker.ts", import.meta.url),
			{ type: "module" },
		);
		this.port = worker.port;
		this.port.start();
		this.port.addEventListener("message", this.handleMessage);
	}
	public async request(message: RequestMessage): Promise<InboundMessage> {
		this.port?.postMessage(message.toString());
		return new Promise<InboundMessage>((resolve) => {
			const messageListerner = (inboundMessage: InboundMessage) => {
				if (
					inboundMessage.headers.CSeq.trim().split(/\s+/)[0] !==
					message.headers.CSeq.trim().split(/\s+/)[0]
				) {
					return;
				}
				if (inboundMessage.subject.startsWith("SIP/2.0 100 ")) {
					return; // ignore
				}
				this.off("inboundMessage", messageListerner);
				resolve(inboundMessage);
			};
			this.on("inboundMessage", messageListerner);
		});
	}
	public async reply(message: ResponseMessage) {
		this.port?.postMessage(message.toString());
	}
	public async dispose() {
		if (this.port === null) return;
		this.port.postMessage({ type: "disconnect" });
		this.port.removeEventListener("message", this.handleMessage);
		this.port.close();
		this.port = null;
	}
	private handleMessage = (event: MessageEvent): void => {
		this.emit("inboundMessage", event.data as InboundMessage);
		console.log("tab received SIP message:", event);
	};
}

const webPhone = new WebPhone({
	sipClient: new MySipClient(),
	sipInfo: JSON.parse(import.meta.env.VITE_SIP_INFO),
});

export default function App() {
	const [phoneNumber, setPhoneNumber] = useState("");
	const [inboundCall, setInboundCall] = useState<InboundCallSession | null>(
		null,
	);

	useEffect(() => {
		const handleInboundCall = (callSession: InboundCallSession) => {
			setInboundCall(callSession);
		};

		webPhone.on("inboundCall", handleInboundCall);
		webPhone.start();
		return () => {
			webPhone.off("inboundCall", handleInboundCall);
			webPhone.dispose();
		};
	}, []);

	const handleCall = () => {
		const number = phoneNumber.trim();
		if (number === "") return;
		webPhone.call(number);
	};

	const handleAnswer = async () => {
		if (inboundCall === null) return;
		await inboundCall.answer();
		setInboundCall(null);
	};

	return (
		<div>
			<h1>SharedWorker demo</h1>
			<label htmlFor="phone-number">Phone number</label>
			<input
				id="phone-number"
				type="tel"
				value={phoneNumber}
				onChange={(event) => setPhoneNumber(event.target.value)}
			/>
			<button
				type="button"
				onClick={handleCall}
				disabled={phoneNumber.trim() === ""}
			>
				Call
			</button>
			{inboundCall && (
				<button type="button" onClick={handleAnswer}>
					Answer
				</button>
			)}
		</div>
	);
}
