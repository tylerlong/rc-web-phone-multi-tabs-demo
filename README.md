# RingCentral Web Phone Multi-Tab Demo

This is a small React/Vite demo for running `ringcentral-web-phone` in multiple browser tabs while sharing one SIP WebSocket connection.

Each tab owns its own UI and `WebPhone` instance. The tabs do not open their own SIP WebSocket connections. Instead, every tab connects to one `SharedWorker`, and that worker owns the real `DefaultSipClient` and RingCentral WSS connection.

This project demonstrates the multi-tab connection and call-routing pattern. It is not a complete softphone UI.

## What This Project Demonstrates

- One shared RingCentral SIP WSS connection across multiple tabs.
- A custom SIP client adapter, `MySipClient`, that forwards SIP traffic to a worker.
- One `DefaultSipClient` inside `src/shared-worker.ts`.
- Inbound call broadcast before a tab claims the call.
- Per-call ownership by `Call-Id`, including multiple calls owned by the same tab.
- Basic call controls: outbound call, answer, decline, cancel, and hang up.

## Architecture

```text
Tab UI
  -> WebPhone
  -> MySipClient
  -> MessagePort
  -> SharedWorker
  -> DefaultSipClient
  -> RingCentral WSS
```

`src/App.tsx` creates a `WebPhone` with `MySipClient`.

`MySipClient` implements the SIP client interface expected by `ringcentral-web-phone`, but it does not open a WSS connection. It serializes outbound SIP messages and sends them to `src/shared-worker.ts` through a `MessagePort`. It also receives inbound SIP messages from the worker and re-emits them to `WebPhone`.

`src/shared-worker.ts` creates one `DefaultSipClient`. That client registers with RingCentral and owns the single WSS connection. The worker also stores connected tabs in `ports` and call ownership in `callOwners`.

## How Message Routing Works

Outbound messages flow from the tab to the worker:

1. `WebPhone` creates a SIP request or response.
2. `MySipClient` posts the serialized SIP message to the worker.
3. The worker checks the message `Call-Id`.
4. If another tab owns that `Call-Id`, the worker ignores the message.
5. Otherwise, the worker sends it through the shared `DefaultSipClient`.

Inbound messages flow from RingCentral WSS to the worker:

1. `DefaultSipClient` emits an inbound SIP message.
2. The worker checks the inbound message `Call-Id`.
3. If the `Call-Id` is owned, the worker posts the message only to that tab.
4. If the `Call-Id` is unclaimed, the worker broadcasts the message to every connected tab.

That broadcast is what lets every tab show the same incoming call before one tab handles it.

## Multiple Calls Per Tab

Call ownership is tracked as `Call-Id -> MessagePort`.

One tab can own multiple calls because many `Call-Id` values can point to the same `MessagePort`.

A tab claims a call when it starts an outbound call, answers an inbound call, or declines an inbound call. The tab sends `associateCallId` to the worker. The worker stores that owner and sends `callClaimed` to the other tabs so they can remove their duplicate local call session.

Ownership is released when the call session is disposed. If a tab disconnects, the worker removes every `Call-Id` owned by that tab.

## Requirements

- Node.js
- pnpm
- A browser with `SharedWorker` and WebRTC support
- RingCentral SIP information for `VITE_SIP_INFO`

## Setup

Install dependencies:

```sh
pnpm install
```

Create `.env` from `.env.example` and replace the fake SIP values:

```sh
cp .env.example .env
```

`VITE_SIP_INFO` must be a JSON string with the SIP credentials and server settings expected by `ringcentral-web-phone`.

## Run

Start the dev server:

```sh
pnpm dev
```

Open the app in more than one browser tab. Each tab should connect to the same shared worker and share the same RingCentral WSS connection.

## Important Files

- `src/App.tsx`: React UI, `WebPhone`, and `MySipClient`.
- `src/shared-worker.ts`: shared SIP client, WSS connection, tab ports, and call routing.
- `src/main.tsx`: React entrypoint.
- `src/index.css`: Tailwind CSS import.
- `.env.example`: example `VITE_SIP_INFO` shape.
- `vite.config.ts`: Vite, React, and Tailwind setup.
