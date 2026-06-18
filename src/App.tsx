import { useEffect, useReducer, useState } from "react";
import WebPhone from "ringcentral-web-phone";
import type InboundCallSession from "ringcentral-web-phone/call-session/inbound";
import type CallSession from "ringcentral-web-phone/call-session/index";
import type OutboundCallSession from "ringcentral-web-phone/call-session/outbound";
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
	associateCallId(callId: string) {
		this.port?.postMessage({ type: "associateCallId", callId });
	}
	releaseCallId(callId: string) {
		this.port?.postMessage({ type: "releaseCallId", callId });
	}
	disconnect() {
		if (!this.port) return;
		this.port.postMessage({ type: "disconnect" });
		this.port.removeEventListener("message", this.handleMessage);
		this.port.close();
		this.port = null;
	}
	async dispose() {
		this.disconnect();
	}
	private handleMessage = (event: MessageEvent) => {
		if (
			typeof event.data === "object" &&
			event.data !== null &&
			(event.data as { type?: unknown }).type === "callClaimed"
		) {
			this.emit("callClaimed", (event.data as { callId: string }).callId);
			return;
		}
		this.emit("inboundMessage", event.data as InboundMessage);
	};
}

const sipClient = new MySipClient();
const webPhone = new WebPhone({
	sipClient,
	sipInfo: JSON.parse(import.meta.env.VITE_SIP_INFO),
});

const ownedCallIds = new Set<string>();
const watchedCallSessions = new WeakSet<CallSession>();

const claimCallSession = (callSession: CallSession) => {
	const { callId } = callSession;
	if (ownedCallIds.has(callId)) return;
	ownedCallIds.add(callId);
	sipClient.associateCallId(callId);
	callSession.once("disposed", () => {
		ownedCallIds.delete(callId);
		sipClient.releaseCallId(callId);
	});
};

const isInboundCall = (
	callSession: CallSession,
): callSession is InboundCallSession => callSession.direction === "inbound";

const isOutboundCall = (
	callSession: CallSession,
): callSession is OutboundCallSession => callSession.direction === "outbound";

export default function App() {
	const [phoneNumber, setPhoneNumber] = useState("");
	const [, rerender] = useReducer((count) => count + 1, 0);

	useEffect(() => {
		const watchCallSession = (callSession: CallSession) => {
			if (watchedCallSessions.has(callSession)) return;
			watchedCallSessions.add(callSession);

			callSession.on("ringing", rerender);
			callSession.on("answered", rerender);
			callSession.on("failed", rerender);
			callSession.once("disposed", rerender);
		};
		const handleInboundCall = (callSession: InboundCallSession) => {
			watchCallSession(callSession);
			rerender();
		};
		const handleOutboundCall = (callSession: OutboundCallSession) => {
			claimCallSession(callSession);
			watchCallSession(callSession);
			rerender();
		};
		const handleCallClaimed = (callId: string) => {
			if (ownedCallIds.has(callId)) return;

			const index = webPhone.callSessions.findIndex(
				(callSession) => callSession.callId === callId,
			);
			if (index === -1) return;
			const [callSession] = webPhone.callSessions.splice(index, 1);
			callSession.dispose();
			rerender();
		};
		const handlePageHide = (event: PageTransitionEvent) => {
			if (!event.persisted) sipClient.disconnect();
		};

		webPhone.on("inboundCall", handleInboundCall);
		webPhone.on("outboundCall", handleOutboundCall);
		sipClient.on("callClaimed", handleCallClaimed);
		window.addEventListener("pagehide", handlePageHide);
		void webPhone.start();
		return () => {
			window.removeEventListener("pagehide", handlePageHide);
			webPhone.off("inboundCall", handleInboundCall);
			webPhone.off("outboundCall", handleOutboundCall);
			sipClient.off("callClaimed", handleCallClaimed);
			webPhone.dispose();
		};
	}, []);

	const phoneNumberToCall = phoneNumber.trim();
	const callSessions = webPhone.callSessions.filter(
		(callSession) => callSession.state !== "disposed",
	);
	const handleCall = () => {
		if (!phoneNumberToCall) return;
		void webPhone.call(phoneNumberToCall);
	};

	const handleAnswer = (callSession: InboundCallSession) => {
		claimCallSession(callSession);
		void callSession.answer().catch(console.error);
	};

	const handleDecline = (callSession: InboundCallSession) => {
		claimCallSession(callSession);
		void callSession.decline().catch(console.error);
	};

	const handleCancel = (callSession: OutboundCallSession) => {
		void callSession.cancel().catch(console.error);
	};

	const handleHangup = (callSession: CallSession) => {
		void callSession.hangup().catch(console.error);
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

				<div className="mt-5">
					<button
						className="rounded-md bg-emerald-600 px-4 py-2 font-medium text-sm text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
						type="button"
						onClick={handleCall}
						disabled={!phoneNumberToCall}
					>
						Call
					</button>
				</div>

				{callSessions.length > 0 && (
					<div className="mt-8 border-zinc-200 border-t pt-5">
						<p className="mb-3 font-medium text-sm text-zinc-700">Calls</p>
						<div className="space-y-3">
							{callSessions.map((callSession) => (
								<div
									className="rounded-md border border-zinc-200 p-3"
									key={callSession.callId}
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<p className="truncate font-medium text-sm">
												{callSession.remoteNumber || "Unknown number"}
											</p>
											<p className="mt-1 text-xs text-zinc-500">
												{callSession.direction} ·{" "}
												{callSession.state === "init"
													? "dialing"
													: callSession.state}
											</p>
										</div>
										<div className="flex shrink-0 flex-wrap justify-end gap-2">
											{isInboundCall(callSession) &&
												callSession.state === "ringing" && (
													<>
														<button
															className="rounded-md border border-emerald-600 px-3 py-1.5 font-medium text-emerald-700 text-sm hover:bg-emerald-50"
															type="button"
															onClick={() => handleAnswer(callSession)}
														>
															Answer
														</button>
														<button
															className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium text-sm text-zinc-700 hover:bg-zinc-50"
															type="button"
															onClick={() => handleDecline(callSession)}
														>
															Decline
														</button>
													</>
												)}
											{isOutboundCall(callSession) &&
												callSession.state === "ringing" && (
													<button
														className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium text-sm text-zinc-700 hover:bg-zinc-50"
														type="button"
														onClick={() => handleCancel(callSession)}
													>
														Cancel
													</button>
												)}
											{callSession.state === "answered" && (
												<button
													className="rounded-md border border-red-300 px-3 py-1.5 font-medium text-red-700 text-sm hover:bg-red-50"
													type="button"
													onClick={() => handleHangup(callSession)}
												>
													Hang up
												</button>
											)}
										</div>
									</div>
								</div>
							))}
						</div>
					</div>
				)}
			</section>
		</main>
	);
}
