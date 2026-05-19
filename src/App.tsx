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
	request(message: RequestMessage) {
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
		<main className="min-h-screen bg-zinc-50 p-6 text-zinc-950">
			<section className="mx-auto mt-12 max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
				<h1 className="font-semibold text-2xl">SharedWorker demo</h1>

				<div className="mt-8 space-y-2">
					<label
						className="block font-medium text-sm text-zinc-700"
						htmlFor="phone-number"
					>
						Phone number
					</label>
					<input
						className="w-full rounded-md border border-zinc-300 px-3 py-2 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
						id="phone-number"
						type="tel"
						value={phoneNumber}
						onChange={(event) => setPhoneNumber(event.target.value)}
					/>
				</div>

				<div className="mt-5 flex gap-3">
					<button
						className="rounded-md bg-emerald-600 px-4 py-2 font-medium text-sm text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
						type="button"
						onClick={handleCall}
						disabled={!phoneNumberToCall}
					>
						Call
					</button>
					{inboundCall && (
						<button
							className="rounded-md border border-emerald-600 px-4 py-2 font-medium text-emerald-700 text-sm hover:bg-emerald-50"
							type="button"
							onClick={handleAnswer}
						>
							Answer
						</button>
					)}
				</div>
			</section>
		</main>
	);
}
