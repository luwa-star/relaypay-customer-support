"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Vapi from "@vapi-ai/web";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "idle" | "connecting" | "active" | "error";

interface Message {
	id: number;
	role: "assistant" | "user";
	content: string;
}

let _msgId = 0;

// ─── Logo ─────────────────────────────────────────────────────────────────────

function RelayPayLogo() {
	return (
		<Image
			src="/relaypay_logo_holu.png"
			alt="RelayPay"
			width={140}
			height={40}
			priority
		/>
	);
}

// ─── Animated orb ─────────────────────────────────────────────────────────────

function Orb({
	status,
	agentSpeaking,
	volume,
}: {
	status: Status;
	agentSpeaking: boolean;
	volume: number;
}) {
	const isActive = status === "active" || status === "connecting";
	const isError = status === "error";

	const coreColor = isError ? "#DC2626" : agentSpeaking ? "#0EA5A0" : "#1B3A6B";
	const ringColor = agentSpeaking ? "#0EA5A0" : "#1B3A6B";

	// Volume drives outer ring expansion (0 → no expansion, 1 → 55% expansion)
	const ringScale1 = 1 + volume * 0.3;
	const ringScale2 = 1 + volume * 0.55;

	return (
		<div
			className="relative flex items-center justify-center"
			style={{ width: 176, height: 176 }}
			role="img"
			aria-label={
				status === "connecting"
					? "Connecting"
					: status === "active"
						? agentSpeaking
							? "Agent speaking"
							: "Listening"
						: "Inactive"
			}>
			{/* Outer volume-reactive ring */}
			{isActive && !isError && (
				<div
					className="absolute inset-0 rounded-full"
					style={{
						backgroundColor: ringColor,
						opacity: 0.06,
						transform: `scale(${ringScale2})`,
						transition: "transform 0.1s ease-out",
					}}
				/>
			)}

			{/* Inner volume-reactive ring */}
			{isActive && !isError && (
				<div
					className="absolute inset-0 rounded-full"
					style={{
						backgroundColor: ringColor,
						opacity: 0.11,
						transform: `scale(${ringScale1})`,
						transition: "transform 0.1s ease-out",
					}}
				/>
			)}

			{/* Connecting ping ring (Tailwind built-in animate-ping) */}
			{status === "connecting" && (
				<div
					className="absolute inset-0 rounded-full animate-ping"
					style={{ backgroundColor: "#1B3A6B", opacity: 0.12 }}
				/>
			)}

			{/* Core orb */}
			<div
				className="relative rounded-full flex items-center justify-center transition-colors duration-300"
				style={{
					width: 104,
					height: 104,
					backgroundColor: coreColor,
					boxShadow: isActive
						? `0 0 0 5px ${coreColor}18, 0 8px 32px ${coreColor}28`
						: "0 4px 20px rgba(0,0,0,0.10)",
				}}>
				{status === "connecting" ? (
					/* Spinner */
					<div
						className="rounded-full border-[3px] border-white border-t-transparent animate-spin"
						style={{ width: 30, height: 30 }}
					/>
				) : (
					/* Microphone icon */
					<svg
						xmlns="http://www.w3.org/2000/svg"
						className="w-9 h-9 text-white"
						fill="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true">
						<path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
						<path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
					</svg>
				)}
			</div>
		</div>
	);
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function VoiceAgent() {
	const vapiRef = useRef<Vapi | null>(null);
	const [status, setStatus] = useState<Status>("idle");
	const [agentSpeaking, setAgentSpeaking] = useState(false);
	const [volume, setVolume] = useState(0);
	const [isMuted, setIsMuted] = useState(false);
	const [messages, setMessages] = useState<Message[]>([]);
	const [error, setError] = useState<string | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

	// Initialise VAPI once on mount
	useEffect(() => {
		const key = process.env.NEXT_PUBLIC_VAPI_KEY;
		if (!key) {
			console.error("[VoiceAgent] NEXT_PUBLIC_VAPI_KEY is not set.");
			return;
		}

		const vapi = new Vapi(key);
		vapiRef.current = vapi;

		vapi.on("call-start", () => {
			setStatus("active");
			setError(null);
		});

		vapi.on("call-end", () => {
			setStatus("idle");
			setAgentSpeaking(false);
			setVolume(0);
		});

		vapi.on("speech-start", () => setAgentSpeaking(true));
		vapi.on("speech-end", () => setAgentSpeaking(false));
		vapi.on("volume-level", (v) => setVolume(v));

		vapi.on("message", (msg: any) => {
			if (msg.type === "transcript" && msg.transcriptType === "final") {
				setMessages((prev) => [
					...prev.slice(-19),
					{
						id: ++_msgId,
						role: msg.role as "assistant" | "user",
						content: msg.transcript,
					},
				]);
			}
		});

		vapi.on("error", (err: any) => {
			console.error("[VoiceAgent] error:", err);
			setStatus("error");
			setAgentSpeaking(false);
			setVolume(0);
			setError(
				typeof err?.message === "string"
					? err.message
					: "An error occurred. Please try again.",
			);
		});

		return () => {
			vapi.stop();
		};
	}, []);

	// Auto-scroll transcript to latest message
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [messages]);

	const startCall = useCallback(async () => {
		const vapi = vapiRef.current;
		const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;

		if (!vapi) {
			setError("Voice agent not initialised. Please refresh the page.");
			return;
		}
		if (!assistantId) {
			setError("Assistant not configured. Please contact support.");
			return;
		}

		setStatus("connecting");
		setMessages([]);
		setError(null);
		setIsMuted(false);

		try {
			const call = await vapi.start(assistantId);
			if (!call) {
				setStatus("error");
				setError("Failed to initiate call. Please try again.");
			}
		} catch {
			setStatus("error");
			setError(
				"Failed to connect. Please check your microphone permissions and try again.",
			);
		}
	}, []);

	const endCall = useCallback(() => {
		vapiRef.current?.stop();
		setStatus("idle");
		setAgentSpeaking(false);
		setVolume(0);
	}, []);

	const toggleMute = useCallback(() => {
		if (!vapiRef.current) return;
		const next = !isMuted;
		vapiRef.current.setMuted(next);
		setIsMuted(next);
	}, [isMuted]);

	const isActive = status === "active" || status === "connecting";

	const statusText =
		status === "idle"
			? "Ready to assist you"
			: status === "connecting"
				? "Connecting to support..."
				: status === "error"
					? (error ?? "Something went wrong")
					: agentSpeaking
						? "Agent is speaking"
						: "Listening...";

	const statusColor =
		status === "error"
			? "#DC2626"
			: status === "active" && agentSpeaking
				? "#0EA5A0"
				: status === "active"
					? "#1B3A6B"
					: "#6B7280";

	return (
		<div
			className="flex flex-col min-h-screen"
			style={{
				backgroundColor: "#F5F7FA",
				fontFamily: "var(--font-sans, Inter, system-ui, sans-serif)",
			}}>
			{/* ── Header ────────────────────────────────────────────────────── */}
			<header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
				<RelayPayLogo />
				<div
					className="flex items-center gap-2 text-xs"
					style={{ color: "#6B7280" }}>
					<div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
					Secure connection
				</div>
			</header>

			{/* ── Main ──────────────────────────────────────────────────────── */}
			<main className="flex flex-col flex-1 items-center justify-center gap-8 px-4 py-16">
				{/* Heading */}
				<div className="text-center space-y-2">
					<h1 className="text-2xl font-semibold" style={{ color: "#1B3A6B" }}>
						Customer Support
					</h1>
					<p
						className="text-sm leading-relaxed max-w-xs mx-auto"
						style={{ color: "#6B7280" }}>
						Ask us anything about your payments, invoices, transfers, or
						account.
					</p>
				</div>

				{/* Animated orb */}
				<Orb status={status} agentSpeaking={agentSpeaking} volume={volume} />

				{/* Status text */}
				<p className="text-sm font-medium" style={{ color: statusColor }}>
					{statusText}
				</p>

				{/* Call controls */}
				<div className="flex items-center gap-3">
					{!isActive ? (
						<button
							onClick={startCall}
							className="inline-flex items-center gap-2 rounded-lg px-7 py-3 text-sm font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
							style={{ backgroundColor: "#1B3A6B" }}
							onMouseEnter={(e) =>
								((e.currentTarget as HTMLButtonElement).style.backgroundColor =
									"#15305E")
							}
							onMouseLeave={(e) =>
								((e.currentTarget as HTMLButtonElement).style.backgroundColor =
									"#1B3A6B")
							}>
							<Mic className="w-4 h-4" />
							Start Voice Call
						</button>
					) : (
						<>
							<button
								onClick={toggleMute}
								disabled={status === "connecting"}
								className={cn(
									"inline-flex items-center gap-2 rounded-lg border px-5 py-3 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
									isMuted
										? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
										: "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
								)}>
								{isMuted ? (
									<MicOff className="w-4 h-4" />
								) : (
									<Mic className="w-4 h-4" />
								)}
								{isMuted ? "Unmute" : "Mute"}
							</button>

							<button
								onClick={endCall}
								className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2">
								<PhoneOff className="w-4 h-4" />
								End Call
							</button>
						</>
					)}
				</div>

				{/* Transcript */}
				{messages.length > 0 && (
					<div className="w-full max-w-lg">
						<div className="mb-3 border-t border-gray-200 pt-4">
							<span
								className="text-xs font-semibold uppercase tracking-wider"
								style={{ color: "#9CA3AF" }}>
								Conversation
							</span>
						</div>
						<div
							ref={scrollRef}
							className="max-h-52 overflow-y-auto space-y-4 pr-1">
							{messages.map((msg) => (
								<div key={msg.id} className="flex gap-3 text-sm">
									<span
										className="w-10 shrink-0 font-semibold"
										style={{
											color: msg.role === "assistant" ? "#0EA5A0" : "#1B3A6B",
										}}>
										{msg.role === "assistant" ? "Agent" : "You"}
									</span>
									<span
										className="leading-relaxed"
										style={{ color: "#374151" }}>
										{msg.content}
									</span>
								</div>
							))}
						</div>
					</div>
				)}
			</main>

			{/* ── Footer ────────────────────────────────────────────────────── */}
			<footer className="bg-white border-t border-gray-200 py-4 text-center">
				<p className="text-xs" style={{ color: "#9CA3AF" }}>
					<span>&copy; {new Date().getFullYear()} </span> RelayPay &middot; All
					conversations are private and secure
				</p>
			</footer>
		</div>
	);
}
