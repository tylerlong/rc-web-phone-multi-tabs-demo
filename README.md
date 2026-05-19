# RingCentral Web Phone Multi-Tab Demo

This project is a small React demo for using `ringcentral-web-phone` across multiple browser tabs.

The key idea is that browser tabs share one `SharedWorker`. The worker owns the real SIP client and WebSocket connection, while each tab talks to the worker through a `MessagePort`. This avoids every tab opening its own SIP connection.

## What It Does

- Starts a `ringcentral-web-phone` instance in the React app.
- Replaces the default SIP client with a custom client that sends SIP messages to a `SharedWorker`.
- Keeps one `DefaultSipClient` inside the shared worker.
- Broadcasts inbound SIP messages from the worker back to all connected tabs.
- Lets a tab place an outbound call by phone number.
- Shows an `Answer` button when an inbound call is received.

This is a demo, not a complete softphone UI. It focuses on the multi-tab SIP connection pattern.

## How It Works

`src/App.tsx` creates a `WebPhone` with `MySipClient`.

`MySipClient` implements the SIP client interface expected by `ringcentral-web-phone`:

- `start()` connects the tab to `src/shared-worker.ts`.
- `request()` posts an outbound SIP request to the worker and waits for the matching non-100 response by `CSeq`.
- `reply()` posts SIP responses to the worker.
- `dispose()` disconnects the tab from the worker.

`src/shared-worker.ts` creates one `DefaultSipClient`:

- Every connected tab is stored in a `Set<MessagePort>`.
- Messages from a tab are sent to the SIP server.
- Inbound SIP messages from the server are posted to every connected tab.
- A tab can send `{ "type": "disconnect" }` to remove its port.

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

Open the app in more than one browser tab. Each tab should connect to the same shared worker.

Build for production:

```sh
pnpm build
```

Run formatting and lint checks:

```sh
pnpm check
```

## Important Files

- `src/App.tsx`: React UI and custom SIP client adapter.
- `src/shared-worker.ts`: shared SIP client and tab message routing.
- `src/main.tsx`: React entrypoint.
- `src/index.css`: Tailwind CSS import.
- `.env.example`: required SIP environment variable shape.
- `vite.config.ts`: Vite, React, and Tailwind setup.

