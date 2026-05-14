import WebPhone from "ringcentral-web-phone";

export default function App() {
	return <h1>Hello world</h1>;
}

const webPhone = new WebPhone({
	sipInfo: JSON.parse(import.meta.env.VITE_SIP_INFO),
	debug: true,
});

webPhone.start();
