import { useEffect, useState } from "react";
import WebPhone from "ringcentral-web-phone";
import type InboundCallSession from "ringcentral-web-phone/call-session/inbound";
import EventEmitter from "ringcentral-web-phone/event-emitter";
import type InboundMessage from "ringcentral-web-phone/sip-message/inbound";
import type RequestMessage from "ringcentral-web-phone/sip-message/outbound/request";
import type ResponseMessage from "ringcentral-web-phone/sip-message/outbound/response";
import type { SipClient } from "ringcentral-web-phone/types";

const cseqId = (message: { headers: Record<string, string> }) =>
	message.headers.CSeq.trim().split(/\s+/)[0];

class MySipClient extends EventEmitter implements SipClient {
	private port: MessagePort | null = null;
	async start() {
		if (this.port) return;
		const worker = new SharedWorker(
			new URL("./shared-worker.ts", import.meta.url),
			{ type: "module" },
		);
		this.port = worker.port;
		this.port.start();
		this.port.addEventListener("message", this.handleMessage);
	}
	async request(message: RequestMessage): Promise<InboundMessage> {
		this.port?.postMessage(message.toString());
		return new Promise<InboundMessage>((resolve) => {
			const messageListener = (inboundMessage: InboundMessage) => {
				if (cseqId(inboundMessage) !== cseqId(message)) return;
				if (inboundMessage.subject.startsWith("SIP/2.0 100 ")) {
					return;
				}
				this.off("inboundMessage", messageListener);
				resolve(inboundMessage);
			};
			this.on("inboundMessage", messageListener);
		});
	}
	async reply(message: ResponseMessage) {
		this.port?.postMessage(message.toString());
	}
	async dispose() {
		if (!this.port) return;
		this.port.postMessage({ type: "disconnect" });
		this.port.removeEventListener("message", this.handleMessage);
		this.port.close();
		this.port = null;
	}
	private handleMessage = (event: MessageEvent) => {
		this.emit("inboundMessage", event.data as InboundMessage);
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

	const phoneNumberToCall = phoneNumber.trim();
	const handleCall = () => {
		if (!phoneNumberToCall) return;
		webPhone.call(phoneNumberToCall);
	};

	const handleAnswer = async () => {
		if (!inboundCall) return;
		await inboundCall.answer();
		setInboundCall(null);
	};

	return (
		<div className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-950">
			<div className="mx-auto max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
				<div className="space-y-1">
					<h1 className="font-semibold text-2xl">SharedWorker demo</h1>
					<p className="text-sm text-zinc-600">
						Place calls from multiple browser tabs through one SIP connection.
					</p>
				</div>

				<div className="mt-8 space-y-5">
					<div className="space-y-2">
						<label
							className="block font-medium text-sm text-zinc-700"
							htmlFor="phone-number"
						>
							Phone number
						</label>
						<input
							className="w-full rounded-md border border-zinc-300 px-3 py-2 text-base outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
							id="phone-number"
							type="tel"
							value={phoneNumber}
							onChange={(event) => setPhoneNumber(event.target.value)}
						/>
					</div>

					<div className="flex flex-wrap gap-3">
						<button
							className="rounded-md bg-emerald-600 px-4 py-2 font-medium text-sm text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
							type="button"
							onClick={handleCall}
							disabled={!phoneNumberToCall}
						>
							Call
						</button>
						{inboundCall && (
							<button
								className="rounded-md border border-emerald-600 px-4 py-2 font-medium text-emerald-700 text-sm transition hover:bg-emerald-50"
								type="button"
								onClick={handleAnswer}
							>
								Answer
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
