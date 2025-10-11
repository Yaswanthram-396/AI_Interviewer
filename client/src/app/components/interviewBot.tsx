// /* eslint-disable @typescript-eslint/no-explicit-any */
// "use client";
// import React, { useState, useRef, useEffect, useCallback } from "react";
// import { Mic, Loader2, Clock, Video, MessageSquare, Wifi, Headphones } from "lucide-react";

// interface ConversationMessage {
//   id: number;
//   sender: "bot" | "user";
//   text: string;
//   isAudio: boolean;
// }

// interface TTSResponse {
//   type: "tts_audio";
//   audioBase64: string;
//   text: string;
// }

// interface STTResponse {
//   type: "interim_transcript" | "final_transcript";
//   transcript: string;
// }

// interface STTStartedResponse {
//   type: "stt_started";
//   sessionId: string;
// }

// interface SessionEnded {
//   type: "session_ended";
//   message: string;
// }

// interface ErrorResponse {
//   type: "error" | "stt_error" | "warning";
//   message: string;
// }

// type WSMessage = TTSResponse | STTResponse | STTStartedResponse | SessionEnded | ErrorResponse;

// const SESSION_ID = "EARLYJOBS_SESSION_ID";

// const InterviewBot = ({ id }: { id: string }) => {
//   const wsRef = useRef<WebSocket | null>(null);
//   const userVideoRef = useRef<HTMLVideoElement>(null);
//   const sessionRecorderRef = useRef<MediaRecorder | null>(null);
//   const sessionChunksRef = useRef<BlobPart[]>([]);
//   const timerRef = useRef<NodeJS.Timeout | null>(null);
//   const audioStreamRef = useRef<MediaStream | null>(null);
//   const audioContextRef = useRef<AudioContext | null>(null);
//   const workletNodeRef = useRef<AudioWorkletNode | null>(null);

//   const isRecordingRef = useRef<boolean>(false);
//   const isSTTStreamReadyRef = useRef<boolean>(false);

//   const [conversation, setConversation] = useState<ConversationMessage[]>([]);
//   const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
//   const [isRecording, setIsRecording] = useState(false);
//   const [isBotSpeaking, setIsBotSpeaking] = useState(false);
//   const [isLoading, setIsLoading] = useState(false);
//   const [liveTranscript, setLiveTranscript] = useState("");
//   const [timeRemaining, setTimeRemaining] = useState(15 * 60);
//   const [sessionStarted, setSessionStarted] = useState(false);
//   const [sessionRecordingUrl, setSessionRecordingUrl] = useState<string | null>(null);
//   const [errorMessage, setErrorMessage] = useState<string | null>(null);
//   const [isSTTStreamReady, setIsSTTStreamReady] = useState(false);
//   const conversationEndRef = useRef<HTMLDivElement>(null);

//   const scrollToBottom = () => {
//     conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
//   };

//   const addMessage = useCallback((sender: "bot" | "user", text: string, isAudio: boolean = false) => {
//     setConversation((prev) => [...prev, { id: Date.now() + Math.random(), sender, text, isAudio }]);
//   }, []);

//   const getWsUrl = () => {
//     const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
//     const host = window.location.hostname;
//     const port = host === "localhost" || host.includes("127.0.0.1") ? ":8081" : "";
//     return `${protocol}//${host}${port}`;
//   };

//   const convertFloat32ToInt16 = (buffer: Float32Array) => {
//     const l = buffer.length;
//     const buf = new Int16Array(l);
//     for (let i = 0; i < l; i++) {
//       buf[i] = Math.max(-1, Math.min(1, buffer[i])) * 0x7fff;
//     }
//     return buf.buffer;
//   };

//   const sendTTSRequest = (prompt: string) => {
//     if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
//       addMessage("bot", "Connection not ready. Please wait for connection or refresh.", false);
//       return;
//     }
//     setIsLoading(true);
//     wsRef.current.send(
//       JSON.stringify({
//         type: "tts_request",
//         prompt,
//         sessionId: SESSION_ID,
//         interviewId: id
//       })
//     );
//   };

//   const sendAudioData = useCallback((audioData: ArrayBuffer) => {
//     if (!isRecordingRef.current || wsRef.current?.readyState !== WebSocket.OPEN || !isSTTStreamReadyRef.current) {
//       return;
//     }
//     const u8 = new Uint8Array(audioData);
//     let base64Audio = "";
//     for (let i = 0; i < u8.length; i++) {
//       base64Audio += String.fromCharCode(u8[i]);
//     }
//     wsRef.current.send(
//       JSON.stringify({
//         type: "audio_chunk",
//         audioBase64: btoa(base64Audio),
//         sessionId: SESSION_ID,
//       })
//     );
//   }, []);

//   const startWebSocket = useCallback(() => {
//     if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

//     setWsStatus("connecting");
//     const ws = new WebSocket(getWsUrl());
//     wsRef.current = ws;

//     ws.onopen = () => {
//       setWsStatus("connected");
//       console.log("✅ Connected to WebSocket");
//     };

//     ws.onmessage = async (event: MessageEvent) => {
//       try {
//         const data: WSMessage = JSON.parse(event.data);
//         setIsLoading(false);

//         switch (data.type) {
//           case "tts_audio": {
//             const { audioBase64, text } = data as TTSResponse;
//             addMessage("bot", text, true);

//             const arrayBuffer = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0)).buffer;

//             if (!audioContextRef.current) {
//               const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
//               if (AudioContextClass) audioContextRef.current = new AudioContextClass();
//             }

//             if (audioContextRef.current) {
//               const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
//               const source = audioContextRef.current.createBufferSource();
//               source.buffer = audioBuffer;
//               source.connect(audioContextRef.current.destination);

//               setIsBotSpeaking(true);
//               source.start(0);

//               source.onended = () => {
//                 setIsBotSpeaking(false);
//               };
//             }
//             break;
//           }
//           case "stt_started":
//             setIsSTTStreamReady(true);
//             isSTTStreamReadyRef.current = true;
//             console.log("✅ STT stream ready from server");
//             break;
//           case "interim_transcript":
//             setLiveTranscript((data as STTResponse).transcript);
//             break;
//           case "final_transcript": {
//             const transcript = (data as STTResponse).transcript;
//             if (transcript) {
//               addMessage("user", transcript, true);
//               sendTTSRequest(transcript);
//             } else if (!isRecording) {
//               addMessage("user", "I couldn't hear that. Could you repeat?", true);
//             }
//             setLiveTranscript("");
//             break;
//           }
//           case "session_ended":
//             endSession();
//             addMessage("bot", (data as SessionEnded).message, false);
//             break;
//           case "error":
//           case "stt_error":
//           case "warning":
//             setErrorMessage(data.message);
//             setIsSTTStreamReady(false);
//             isSTTStreamReadyRef.current = false;
//             stopRecording();
//             break;
//           default:
//             console.warn("Unknown message type:", data);
//         }
//       } catch (e) {
//         console.error("Error processing WebSocket message:", e);
//         setIsLoading(false);
//         setErrorMessage("Failed to process server message");
//       }
//     };

//     ws.onclose = () => {
//       setWsStatus("disconnected");
//       setIsLoading(false);
//       setIsSTTStreamReady(false);
//       isSTTStreamReadyRef.current = false;
//       console.log("⚡ WebSocket disconnected. Retrying in 5 seconds...");
//       setTimeout(startWebSocket, 5000);
//     };

//     ws.onerror = (err) => {
//       console.error("WebSocket error:", err);
//     };
//   }, [addMessage]);

//   const startRecording = async () => {
//     if (!sessionStarted || wsStatus !== "connected" || isRecording) return;

//     setIsSTTStreamReady(false);
//     isSTTStreamReadyRef.current = false;
//     setLiveTranscript("");
//     setIsLoading(true);

//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({
//         audio: {
//           sampleRate: 16000,
//           channelCount: 1,
//           echoCancellation: true,
//           noiseSuppression: true,
//         },
//       });
//       audioStreamRef.current = stream;

//       const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
//       audioContextRef.current = new AudioContextClass({ sampleRate: 16000 });

//       const source = audioContextRef.current.createMediaStreamSource(stream);
//       await audioContextRef.current.audioWorklet.addModule("/pcm-processor.js");
//       const workletNode = new AudioWorkletNode(audioContextRef.current, "pcm-processor");
//       workletNodeRef.current = workletNode;

//       workletNode.port.onmessage = (event) => {
//         if (!isRecordingRef.current) return;
//         const inputData = event.data as Float32Array;
//         const pcmData = convertFloat32ToInt16(inputData);
//         sendAudioData(pcmData);
//       };

//       source.connect(workletNode);
//       workletNode.connect(audioContextRef.current.destination);

//       if (wsRef.current?.readyState === WebSocket.OPEN) {
//         wsRef.current.send(
//           JSON.stringify({ type: "start_stt", sessionId: SESSION_ID })
//         );
//         console.log("🎤 Sent start_stt. Waiting for server ACK...");
//       }
//     } catch (error: any) {
//       console.error("Error accessing microphone:", error.message);
//       addMessage(
//         "bot",
//         `Could not start microphone: ${error.message}. Check permissions.`,
//         false
//       );
//       cleanup();
//       setIsRecording(false);
//       setIsLoading(false);
//       setIsSTTStreamReady(false);
//       isSTTStreamReadyRef.current = false;
//     }
//   };

//   const cleanup = () => {
//     if (audioStreamRef.current) {
//       audioStreamRef.current.getTracks().forEach((track) => track.stop());
//       audioStreamRef.current = null;
//     }
//     if (workletNodeRef.current) {
//       workletNodeRef.current.disconnect();
//       workletNodeRef.current = null;
//     }
//     if (audioContextRef.current) {
//       audioContextRef.current.close();
//       audioContextRef.current = null;
//     }
//   };

//   const stopRecording = () => {
//     if (isRecording) {
//       isRecordingRef.current = false;
//       setIsRecording(false);
//       setIsSTTStreamReady(false);
//       isSTTStreamReadyRef.current = false;
//       cleanup();
//       if (wsRef.current?.readyState === WebSocket.OPEN) {
//         wsRef.current.send(
//           JSON.stringify({ type: "stop_stt", sessionId: SESSION_ID })
//         );
//       }
//       console.log("🛑 Recording stopped.");
//     }
//   };

//   useEffect(() => {
//     if (isSTTStreamReady && audioContextRef.current && !isRecording) {
//       isRecordingRef.current = true;
//       setIsRecording(true);
//       setIsLoading(false);
//       console.log("✅ Started PCM audio streaming");
//     }
//   }, [isSTTStreamReady, isRecording]);

//   const handleStartInterview = async () => {
//     if (wsStatus !== "connected" || sessionStarted) return;

//     try {
//       const userStream = await navigator.mediaDevices.getUserMedia({
//         video: true,
//         audio: true,
//       });
//       if (userVideoRef.current) {
//         userVideoRef.current.srcObject = userStream;
//         userVideoRef.current.muted = true;
//       }

//       const displayStream = await navigator.mediaDevices.getDisplayMedia({
//         video: true,
//         audio: true,
//       });
//       const combinedAudioTracks = [...userStream.getAudioTracks(), ...displayStream.getAudioTracks()];
//       const combinedVideoTracks = [...displayStream.getVideoTracks(), ...userStream.getVideoTracks()];
//       const combinedStream = new MediaStream([...combinedVideoTracks, ...combinedAudioTracks]);

//       sessionRecorderRef.current = new MediaRecorder(combinedStream);
//       sessionChunksRef.current = [];

//       sessionRecorderRef.current.ondataavailable = (e) => {
//         if (e.data.size > 0) sessionChunksRef.current.push(e.data);
//       };

//       sessionRecorderRef.current.onstop = () => {
//         const blob = new Blob(sessionChunksRef.current, { type: "video/webm" });
//         const url = URL.createObjectURL(blob);
//         setSessionRecordingUrl(url);
//         const a = document.createElement("a");
//         a.href = url;
//         a.download = "interview_session.webm";
//         a.click();
//       };

//       sessionRecorderRef.current.start();

//       const startTime = Date.now();
//       timerRef.current = setInterval(() => {
//         const elapsed = Math.floor((Date.now() - startTime) / 1000);
//         const remaining = 15 * 60 - elapsed;
//         setTimeRemaining(remaining);
//         if (remaining <= 0) endSession();
//       }, 1000);

//       setSessionStarted(true);
//       sendTTSRequest("Welcome to the interview. Please start speaking.");
//     } catch (error) {
//       console.error("Error starting session:", error);
//       addMessage(
//         "bot",
//         "Could not start session recording or access media. Continuing without recording.",
//         false
//       );
//       setSessionStarted(true);
//       sendTTSRequest("Welcome to the interview. Please start speaking.");
//     }
//   };

//   const endSession = () => {
//     if (timerRef.current) clearInterval(timerRef.current);
//     setSessionStarted(false);
//     setIsRecording(false);
//     setIsBotSpeaking(false);
//     setIsSTTStreamReady(false);
//     isSTTStreamReadyRef.current = false;
//     setTimeRemaining(15 * 60);
//     isRecordingRef.current = false;

//     cleanup();

//     if (sessionRecorderRef.current && sessionRecorderRef.current.state !== "inactive") {
//       sessionRecorderRef.current.stop();
//     }
//     if (wsRef.current) wsRef.current.close();

//     if (userVideoRef.current && userVideoRef.current.srcObject) {
//       (userVideoRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
//     }
//   };

//   useEffect(() => {
//     startWebSocket();
//     return () => endSession();
//   }, [startWebSocket]);

//   useEffect(() => scrollToBottom(), [conversation, liveTranscript]);

//   const formatTime = (seconds: number) => {
//     const mins = Math.floor(seconds / 60);
//     const secs = seconds % 60;
//     return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
//   };

//   const renderStatusPill = (status: typeof wsStatus) => {
//     const statusClasses = {
//       connecting: "bg-yellow-500",
//       connected: "bg-green-500",
//       disconnected: "bg-red-500",
//     };
//     const statusText = {
//       connecting: "Connecting...",
//       connected: "Connected",
//       disconnected: "Disconnected",
//     };
//     return (
//       <div
//         className={`flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-semibold ${statusClasses[status]}`}
//       >
//         <Wifi size={14} className={status === "connecting" ? "animate-pulse" : ""} />
//         <span>{statusText[status]}</span>
//       </div>
//     );
//   };

//   const renderMessage = (msg: ConversationMessage) => (
//     <div
//       key={msg.id}
//       className={`flex w-full ${msg.sender === "user" ? "justify-end" : "justify-start"} mb-4`}
//     >
//       <div
//         className={`max-w-3/4 p-3 rounded-xl shadow-lg transition-all duration-300 ${
//           msg.sender === "bot" ? "bg-gray-700 text-white rounded-bl-none" : "bg-indigo-500 text-white rounded-br-none"
//         }`}
//       >
//         <p className="text-sm">
//           {msg.sender === "bot" && msg.isAudio && (
//             <Headphones size={16} className="inline-block mr-2 align-middle text-green-300" />
//           )}
//           {msg.sender === "user" && msg.isAudio && (
//             <Mic size={16} className="inline-block mr-2 align-middle text-yellow-300" />
//           )}
//           {msg.text}
//         </p>
//       </div>
//     </div>
//   );

//   return (
//     <div className="min-h-screen bg-black text-white flex items-center justify-center">
//       <div className="w-full h-screen flex flex-col relative">
//         <div className="flex-1 relative grid grid-cols-1 lg:grid-cols-2 gap-0">
//           <div className="relative bg-gradient-to-br from-purple-900 to-purple-700 flex items-center justify-center">
//             <div className="absolute inset-0 flex items-center justify-center">
//               <div className="w-32 h-32 rounded-full bg-purple-600 flex items-center justify-center text-6xl font-bold">
//                 {isBotSpeaking ? "🎙️" : "AI"}
//               </div>
//             </div>
//             <div className="absolute bottom-6 left-6 bg-black bg-opacity-50 px-4 py-2 rounded-lg backdrop-blur-sm">
//               <p className="text-white font-medium">Franchise Earlyjobs</p>
//             </div>
//             {!isBotSpeaking && (
//               <div className="absolute top-6 right-6 w-10 h-10 bg-black bg-opacity-50 rounded-full flex items-center justify-center backdrop-blur-sm">
//                 <span className="text-white text-xl">🔇</span>
//               </div>
//             )}
//           </div>
//           <div className="relative bg-gradient-to-br from-pink-900 to-purple-700 flex items-center justify-center">
//             <video ref={userVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
//             {!sessionStarted && (
//               <div className="absolute inset-0 flex items-center justify-center">
//                 <div className="w-32 h-32 rounded-full bg-pink-600 flex items-center justify-center text-6xl font-bold">
//                   Y
//                 </div>
//               </div>
//             )}
//             <div className="absolute bottom-6 right-6 bg-black bg-opacity-50 px-4 py-2 rounded-lg backdrop-blur-sm">
//               <p className="text-white font-medium">Yaswanth ram Reddy</p>
//             </div>
//             {!isRecording && (
//               <div className="absolute top-6 right-6 w-10 h-10 bg-black bg-opacity-50 rounded-full flex items-center justify-center backdrop-blur-sm">
//                 <span className="text-white text-xl">🔇</span>
//               </div>
//             )}
//           </div>
//         </div>

//         <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-90 border-t border-gray-800">
//           <div className="flex items-center justify-between px-6 py-4">
//             <div className="flex items-center space-x-4">
//               <span className="text-sm text-gray-400">{new Date().toLocaleTimeString()}</span>
//               <span className="text-sm text-gray-400">|</span>
//               <span className="text-sm text-gray-400">zuu-ecei-xsd</span>
//             </div>
//             <div className="flex items-center space-x-2">
//               <button
//                 onClick={isRecording ? stopRecording : startRecording}
//                 disabled={!sessionStarted || isLoading || wsStatus !== "connected" || isSTTStreamReady || isBotSpeaking}
//                 className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
//                   isRecording ? "bg-red-600 hover:bg-red-700" : "bg-gray-700 hover:bg-gray-600"
//                 } disabled:bg-gray-800 disabled:cursor-not-allowed`}
//               >
//                 {isRecording ? <Mic size={20} className="animate-pulse" /> : <span className="text-xl">🎤</span>}
//               </button>
//               <button className="w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition-all">
//                 <Video size={20} />
//               </button>
//               <button className="w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition-all">
//                 <span className="text-xl">📺</span>
//               </button>
//               <button className="w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center transition-all">
//                 <MessageSquare size={20} />
//               </button>
//               <button className="w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition-all">
//                 <span className="text-xl">⋯</span>
//               </button>
//               <button
//                 onClick={endSession}
//                 disabled={!sessionStarted}
//                 className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-all disabled:bg-gray-800 disabled:cursor-not-allowed ml-4"
//               >
//                 <span className="text-xl">📞</span>
//               </button>
//             </div>
//             <div className="flex items-center space-x-2">
//               <button className="w-10 h-10 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition-all">
//                 <span className="text-lg">ℹ️</span>
//               </button>
//               <button className="w-10 h-10 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition-all">
//                 <span className="text-lg">👥</span>
//                 {sessionStarted && <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 rounded-full text-xs flex items-center justify-center">2</span>}
//               </button>
//             </div>
//           </div>
//           <div className="flex items-center justify-center space-x-3 pb-4">
//             {["❤️", "👍", "🎉", "👋", "😂", "😮", "😢", "🤔", "👎"].map((emoji, idx) => (
//               <button key={idx} className="text-2xl hover:scale-125 transition-transform">{emoji}</button>
//             ))}
//           </div>
//         </div>

//         {sessionStarted && (
//           <div className="absolute top-6 left-6 flex items-center space-x-4">
//             {renderStatusPill(wsStatus)}
//             <div className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-black bg-opacity-50 text-sm font-semibold backdrop-blur-sm">
//               <Clock size={16} className="text-red-500" />
//               <span>{formatTime(timeRemaining)}</span>
//             </div>
//           </div>
//         )}

//         {!sessionStarted && (
//           <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
//             <div className="text-center">
//               <h2 className="text-3xl font-bold mb-4">AI Interview Portal</h2>
//               <p className="text-gray-400 mb-8">Ready to start your interview session?</p>
//               <button
//                 onClick={handleStartInterview}
//                 disabled={wsStatus !== "connected"}
//                 className="px-8 py-4 text-lg font-semibold rounded-xl shadow-lg transition-all duration-300 transform bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:bg-gray-600 disabled:cursor-not-allowed"
//               >
//                 {wsStatus === "connected" ? "Start Interview" : "Connecting..."}
//               </button>
//             </div>
//           </div>
//         )}

//         {sessionStarted && (
//           <div className="absolute right-0 top-0 bottom-20 w-96 bg-gray-900 border-l border-gray-800 hidden lg:flex flex-col">
//             <div className="p-4 border-b border-gray-800">
//               <h3 className="font-semibold flex items-center">
//                 <MessageSquare size={18} className="mr-2" />
//                 Conversation
//               </h3>
//             </div>
//             <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
//               {conversation.map(renderMessage)}
//               {isLoading && (
//                 <div className="flex justify-start">
//                   <div className="bg-gray-800 p-3 rounded-lg">
//                     <Loader2 size={18} className="animate-spin text-indigo-400" />
//                   </div>
//                 </div>
//               )}
//               {isRecording && liveTranscript && (
//                 <div className="flex justify-end">
//                   <div className="bg-indigo-600 p-3 rounded-lg opacity-70">
//                     <p className="text-sm">{liveTranscript}</p>
//                   </div>
//                 </div>
//               )}
//               <div ref={conversationEndRef} />
//             </div>
//           </div>
//         )}

//         <style jsx global>{`
//           .custom-scrollbar::-webkit-scrollbar { width: 6px; }
//           .custom-scrollbar::-webkit-scrollbar-track { background: #1f2937; }
//           .custom-scrollbar::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 3px; }
//           .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6b7280; }
//         `}</style>
//       </div>
//     </div>
//   );
// };

// export default InterviewBot;

/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Loader2, Clock, Video, MessageSquare, Wifi, Headphones, X, ChevronLeft, ChevronRight, Settings, Users, PhoneOff, Monitor, Maximize2 } from "lucide-react";

interface ConversationMessage {
  id: number;
  sender: "bot" | "user";
  text: string;
  isAudio: boolean;
}

interface TTSResponse {
  type: "tts_audio";
  audioBase64: string;
  text: string;
}

interface STTResponse {
  type: "interim_transcript" | "final_transcript";
  transcript: string;
}

interface STTStartedResponse {
  type: "stt_started";
  sessionId: string;
}

interface SessionEnded {
  type: "session_ended";
  message: string;
}

interface ErrorResponse {
  type: "error" | "stt_error" | "warning";
  message: string;
}

type WSMessage = TTSResponse | STTResponse | STTStartedResponse | SessionEnded | ErrorResponse;
// Generate "session id" and expiration, re-use if one exists and is not expired.
function generateNewSessionId() {
  // Your logic, e.g. a GUID or timestamp-based string
  return "session_" + Date.now() + "_" + Math.random().toString(36).substring(2,8);
}
const getOrCreateSession = () => {
  const key = "ai_interview_session";
  const saved = localStorage.getItem(key);

  // 15 minutes in ms
  const EXPIRE_MS = 15 * 60 * 1000;
  let sessionId, expiresAt;
  const now = Date.now();

  if (saved) {
    const { sessionId: prevId, expiresAt: prevExpiry } = JSON.parse(saved);
    if (Number(prevExpiry) > now) {
      sessionId = prevId;
      expiresAt = prevExpiry;
    }
  }
  if (!sessionId) {
    sessionId = generateNewSessionId();
    expiresAt = now + EXPIRE_MS;
    localStorage.setItem(key, JSON.stringify({ sessionId, expiresAt }));
  }
  return { sessionId, expiresAt };
};
const { sessionId, expiresAt } = getOrCreateSession();


const InterviewBot = ({ id }: { id: string }) => {
  const wsRef = useRef<WebSocket | null>(null);
  const userVideoRef = useRef<HTMLVideoElement>(null);
  const sessionRecorderRef = useRef<MediaRecorder | null>(null);
  const sessionChunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  const isRecordingRef = useRef<boolean>(false);
  const isSTTStreamReadyRef = useRef<boolean>(false);

  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  const [isRecording, setIsRecording] = useState(false);
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [timeRemaining, setTimeRemaining] = useState(15 * 60);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionRecordingUrl, setSessionRecordingUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSTTStreamReady, setIsSTTStreamReady] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const finalTranscriptBuffer = useRef<string[]>([]);
const finalTranscriptTimeout = useRef<NodeJS.Timeout | null>(null);
const lastAudioSentTime = useRef<number>(Date.now());

  const scrollToBottom = () => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const addMessage = useCallback((sender: "bot" | "user", text: string, isAudio: boolean = false) => {
    setConversation((prev) => [...prev, { id: Date.now() + Math.random(), sender, text, isAudio }]);
  }, []);

  const getWsUrl = () => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.hostname;
    const port = host === "localhost" || host.includes("127.0.0.1") ? ":8081" : "";
    return `${protocol}//${host}${port}`;
  };

const convertFloat32ToInt16 = (buffer: Float32Array) => {
  const l = buffer.length;
  const buf = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    const sample = Math.max(-1, Math.min(1, buffer[i] * 2)); // Boost volume
    buf[i] = sample * 0x7FFF;
  }
  console.log(`Converted audio chunk, size: ${buf.buffer.byteLength}, samples: ${l}`);
  return buf.buffer;
};

  const sendTTSRequest = (prompt: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      addMessage("bot", "Connection not ready. Please wait for connection or refresh.", false);
      return;
    }
    setIsLoading(true);
    wsRef.current.send(
      JSON.stringify({
        type: "tts_request",
        prompt,
        sessionId, 
        expiresAt,
        interviewId: id
      })
    );
  };

const sendAudioData = useCallback((audioData: ArrayBuffer) => {
  if (!isRecordingRef.current || wsRef.current?.readyState !== WebSocket.OPEN || !isSTTStreamReadyRef.current) {
    console.warn("Audio chunk dropped: not recording or stream not ready");
    return;
  }
  if (audioData.byteLength === 0) {
    console.warn("Empty audio chunk, skipping");
    return;
  }
  const u8 = new Uint8Array(audioData);
  let base64Audio = "";
  for (let i = 0; i < u8.length; i++) {
    base64Audio += String.fromCharCode(u8[i]);
  }
  const startTime = performance.now();
  wsRef.current.send(
    JSON.stringify({
      type: "audio_chunk",
      audioBase64: btoa(base64Audio),
      sessionId,
    })
  );
  lastAudioSentTime.current = Date.now();
  console.log(`Sent audio chunk, size: ${audioData.byteLength}, time: ${startTime}`);
}, []);

  const startWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    setWsStatus("connecting");
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus("connected");
      console.log("✅ Connected to WebSocket");
    };

ws.onmessage = async (event: MessageEvent) => {
  try {
    const data: WSMessage = JSON.parse(event.data);
    setIsLoading(false);

    switch (data.type) {
      case "tts_audio": {
        const { audioBase64, text } = data as TTSResponse;
        addMessage("bot", text, true);
        const arrayBuffer = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0)).buffer;

        if (!audioContextRef.current) {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) audioContextRef.current = new AudioContextClass();
        }

        if (audioContextRef.current) {
          const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
          const source = audioContextRef.current.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioContextRef.current.destination);

          setIsBotSpeaking(true);
          source.start(0);

          source.onended = () => {
            setIsBotSpeaking(false);
          };
        }
        break;
      }
      case "stt_started":
        setIsSTTStreamReady(true);
        isSTTStreamReadyRef.current = true;
        console.log(`✅ STT stream ready at ${performance.now()}ms`);
        break;
      case "interim_transcript":
        setLiveTranscript((data as STTResponse).transcript);
        break;
      case "final_transcript": {
        const transcript = (data as STTResponse).transcript;
        console.log(`Final transcript received: ${transcript || "(empty)"}`);
        if (transcript) {
          finalTranscriptBuffer.current.push(transcript);
          if (finalTranscriptTimeout.current) {
            clearTimeout(finalTranscriptTimeout.current);
          }
          finalTranscriptTimeout.current = setTimeout(() => {
            const finalText = finalTranscriptBuffer.current.join(" ").trim();
            if (finalText) {
              addMessage("user", finalText, true);
              sendTTSRequest(finalText);
            } else {
              addMessage("user", "I couldn't hear that. Could you repeat?", true);
            }
            finalTranscriptBuffer.current = [];
            finalTranscriptTimeout.current = null;
          }, 2000);
        }
        setLiveTranscript("");
        break;
      }
      case "session_ended":
        endSession();
        addMessage("bot", (data as SessionEnded).message, false);
        break;
      case "error":
      case "stt_error":
        setErrorMessage(data.message);
        setIsSTTStreamReady(false);
        isSTTStreamReadyRef.current = false;
        stopRecording();
        if (data.message.includes("Audio Timeout Error")) {
          console.warn("Audio timeout detected, restarting STT stream");
          setTimeout(startRecording, 1000); // Restart after 1s
        }
        break;
      case "warning":
        setErrorMessage(data.message);
        break;
      default:
        console.warn("Unknown message type:", data);
    }
  } catch (e) {
    console.error("Error processing WebSocket message:", e);
    setIsLoading(false);
    setErrorMessage("Failed to process server message");
  }
};
    ws.onclose = () => {
      setWsStatus("disconnected");
      setIsLoading(false);
      setIsSTTStreamReady(false);
      isSTTStreamReadyRef.current = false;
      console.log("⚡ WebSocket disconnected. Retrying in 5 seconds...");
      setTimeout(startWebSocket, 5000);
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };
  }, [addMessage]);

const startRecording = async () => {
  if (!sessionStarted || wsStatus !== "connected" || isRecording) return;

  setIsSTTStreamReady(false);
  isSTTStreamReadyRef.current = false;
  setLiveTranscript("");
  setIsLoading(true);
  const recordStartTime = performance.now();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    audioStreamRef.current = stream;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioContextRef.current = new AudioContextClass({ sampleRate: 16000 });

    const source = audioContextRef.current.createMediaStreamSource(stream);
    await audioContextRef.current.audioWorklet.addModule("/pcm-processor.js");
    const workletNode = new AudioWorkletNode(audioContextRef.current, "pcm-processor");
    workletNodeRef.current = workletNode;

    workletNode.port.onmessage = (event) => {
      if (!isRecordingRef.current) return;
      const inputData = event.data as Float32Array;
      const pcmData = convertFloat32ToInt16(inputData);
      sendAudioData(pcmData);
    };

    source.connect(workletNode);
    workletNode.connect(audioContextRef.current.destination);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: "start_stt", sessionId })
      );
      console.log(`🎤 Sent start_stt at ${performance.now() - recordStartTime}ms`);
    }

    // Start timeout check
    const timeoutCheck = setInterval(() => {
      if (Date.now() - lastAudioSentTime.current > 20000 && isRecordingRef.current) {
        console.warn("No audio sent for 20s, restarting STT stream");
        stopRecording();
        setTimeout(startRecording, 1000); // Restart after 1s
      }
    }, 5000);
    timerRef.current = timeoutCheck;
  } catch (error: any) {
    console.error("Error accessing microphone:", error.message);
    addMessage(
      "bot",
      `Could not start microphone: ${error.message}. Check permissions.`,
      false
    );
    cleanup();
    setIsRecording(false);
    setIsLoading(false);
    setIsSTTStreamReady(false);
    isSTTStreamReadyRef.current = false;
  }
};

  const cleanup = () => {
  if (audioStreamRef.current) {
    audioStreamRef.current.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
  }
  if (workletNodeRef.current) {
    workletNodeRef.current.disconnect();
    workletNodeRef.current = null;
  }
  if (audioContextRef.current) {
    audioContextRef.current.close();
    audioContextRef.current = null;
  }
  if (timerRef.current) {
    clearInterval(timerRef.current);
    timerRef.current = null;
  }
};

const stopRecording = () => {
  if (isRecording) {
    isRecordingRef.current = false;
    setIsRecording(false);
    setIsSTTStreamReady(false);
    isSTTStreamReadyRef.current = false;
    cleanup();
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: "stop_stt", sessionId })
      );
    }
    console.log("🛑 Recording stopped.");

    // Process buffered transcripts
    if (finalTranscriptBuffer.current.length > 0) {
      const finalText = finalTranscriptBuffer.current.join(" ").trim();
      if (finalText) {
        addMessage("user", finalText, true);
        sendTTSRequest(finalText);
      } else {
        addMessage("user", "I couldn't hear that. Could you repeat?", true);
      }
      finalTranscriptBuffer.current = [];
    }
    if (finalTranscriptTimeout.current) {
      clearTimeout(finalTranscriptTimeout.current);
      finalTranscriptTimeout.current = null;
    }
  }
};

  useEffect(() => {
    if (isSTTStreamReady && audioContextRef.current && !isRecording) {
      isRecordingRef.current = true;
      setIsRecording(true);
      setIsLoading(false);
      console.log("✅ Started PCM audio streaming");
    }
  }, [isSTTStreamReady, isRecording]);

  const handleStartInterview = async () => {
    if (wsStatus !== "connected" || sessionStarted) return;

    try {
      const userStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      if (userVideoRef.current) {
        userVideoRef.current.srcObject = userStream;
        userVideoRef.current.muted = true;
      }

      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      const combinedAudioTracks = [...userStream.getAudioTracks(), ...displayStream.getAudioTracks()];
      const combinedVideoTracks = [...displayStream.getVideoTracks(), ...userStream.getVideoTracks()];
      const combinedStream = new MediaStream([...combinedVideoTracks, ...combinedAudioTracks]);

      sessionRecorderRef.current = new MediaRecorder(combinedStream);
      sessionChunksRef.current = [];

      sessionRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) sessionChunksRef.current.push(e.data);
      };

      sessionRecorderRef.current.onstop = () => {
        const blob = new Blob(sessionChunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        setSessionRecordingUrl(url);
        const a = document.createElement("a");
        a.href = url;
        a.download = "interview_session.webm";
        a.click();
      };

      sessionRecorderRef.current.start();

      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const remaining = 15 * 60 - elapsed;
        setTimeRemaining(remaining);
        if (remaining <= 0) endSession();
      }, 1000);

      setSessionStarted(true);
      sendTTSRequest("Welcome to the interview. Please start speaking.");
    } catch (error) {
      console.error("Error starting session:", error);
      addMessage(
        "bot",
        "Could not start session recording or access media. Continuing without recording.",
        false
      );
      setSessionStarted(true);
      sendTTSRequest("Welcome to the interview. Please start speaking.");
    }
  };

  const endSession = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSessionStarted(false);
    setIsRecording(false);
    setIsBotSpeaking(false);
    setIsSTTStreamReady(false);
    isSTTStreamReadyRef.current = false;
    setTimeRemaining(15 * 60);
    isRecordingRef.current = false;

    cleanup();

    if (sessionRecorderRef.current && sessionRecorderRef.current.state !== "inactive") {
      sessionRecorderRef.current.stop();
    }
    if (wsRef.current) wsRef.current.close();

    if (userVideoRef.current && userVideoRef.current.srcObject) {
      (userVideoRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
    }
  };

  useEffect(() => {
    startWebSocket();
    return () => endSession();
  }, [startWebSocket]);

  useEffect(() => scrollToBottom(), [conversation, liveTranscript]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const renderStatusPill = (status: typeof wsStatus) => {
    const statusClasses = {
      connecting: "bg-yellow-100 text-yellow-800 border-yellow-300",
      connected: "bg-green-100 text-green-800 border-green-300",
      disconnected: "bg-red-100 text-red-800 border-red-300",
    };
    const statusText = {
      connecting: "Connecting...",
      connected: "Connected",
      disconnected: "Disconnected",
    };
    return (
      <div
        className={`flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${statusClasses[status]}`}
      >
        <div className={`w-2 h-2 rounded-full ${status === "connected" ? "bg-green-500" : status === "connecting" ? "bg-yellow-500 animate-pulse" : "bg-red-500"}`} />
        <span>{statusText[status]}</span>
      </div>
    );
  };

  const renderMessage = (msg: ConversationMessage) => (
    <div
      key={msg.id}
      className={`flex w-full ${msg.sender === "user" ? "justify-end" : "justify-start"} mb-3`}
    >
      <div
        className={`max-w-[75%] p-3 rounded-2xl shadow-sm ${
          msg.sender === "bot" 
            ? "bg-gray-100 text-gray-900" 
            : "bg-blue-600 text-white"
        }`}
      >
        <div className="flex items-start space-x-2">
          {msg.sender === "bot" && msg.isAudio && (
            <Headphones size={14} className="mt-0.5 flex-shrink-0 text-blue-500" />
          )}
          {msg.sender === "user" && msg.isAudio && (
            <Mic size={14} className="mt-0.5 flex-shrink-0 text-blue-200" />
          )}
          <p className="text-sm leading-relaxed">{msg.text}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-full h-screen flex flex-col relative bg-white">
        {/* Header */}
        <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 z-20">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">AI</span>
              </div>
              <div>
                <h1 className="text-sm font-semibold text-gray-900">AI Interview</h1>
                <p className="text-xs text-gray-500">Franchise Earlyjobs</p>
              </div>
            </div>
          </div>
          
          {sessionStarted && (
            <div className="flex items-center space-x-3">
              {renderStatusPill(wsStatus)}
              <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-red-50 text-red-700 text-xs font-semibold border border-red-200">
                <Clock size={14} />
                <span>{formatTime(timeRemaining)}</span>
              </div>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <Settings size={18} className="text-gray-600" />
            </button>
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative">
              <Users size={18} className="text-gray-600" />
              {sessionStarted && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">2</span>
              )}
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 relative flex">
          {/* Video Grid */}
          <div className={`flex-1 grid ${isChatOpen ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-2'} gap-4 p-4 bg-gray-900 transition-all duration-300`}>
            {/* AI Bot Video */}
            <div className="relative bg-gradient-to-br from-blue-900 to-purple-900 rounded-2xl overflow-hidden shadow-2xl">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative">
                  <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-2xl">
                    <span className="text-5xl">{isBotSpeaking ? "🎙️" : "🤖"}</span>
                  </div>
                  {isBotSpeaking && (
                    <div className="absolute inset-0 rounded-full border-4 border-blue-400 animate-ping opacity-50"></div>
                  )}
                </div>
              </div>
              <div className="absolute bottom-4 left-4 bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10">
                <p className="text-white font-medium text-sm">AI Interviewer</p>
              </div>
              {!isBotSpeaking && (
                <div className="absolute top-4 right-4 w-8 h-8 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10">
                  <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                </div>
              )}
            </div>

            {/* User Video */}
            <div className="relative bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl overflow-hidden shadow-2xl">
              <video 
                ref={userVideoRef} 
                autoPlay 
                playsInline 
                muted 
                className="w-full h-full object-cover"
              />
              {!sessionStarted && (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                  <div className="w-32 h-32 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center text-5xl font-bold text-white shadow-2xl">
                    Y
                  </div>
                </div>
              )}
              <div className="absolute bottom-4 right-4 bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10">
                <p className="text-white font-medium text-sm">You</p>
              </div>
              {!isRecording && sessionStarted && (
                <div className="absolute top-4 right-4 w-8 h-8 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10">
                  <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                </div>
              )}
            </div>
          </div>

          {/* Chat Panel */}
          {sessionStarted && (
            <div 
              className={`${
                isChatOpen ? 'w-96' : 'w-0'
              } bg-white border-l border-gray-200 flex flex-col transition-all duration-300 overflow-hidden`}
            >
              <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
                <h3 className="font-semibold text-gray-900 flex items-center text-sm">
                  <MessageSquare size={16} className="mr-2 text-blue-600" />
                  Conversation
                </h3>
                <button 
                  onClick={() => setIsChatOpen(false)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={16} className="text-gray-500" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50 max-h-[75vh]">
                {conversation.map(renderMessage)}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-200 p-3 rounded-2xl">
                      <Loader2 size={16} className="animate-spin text-blue-600" />
                    </div>
                  </div>
                )}
                {isRecording && liveTranscript && (
                  <div className="flex justify-end">
                    <div className="bg-blue-400 text-white p-3 rounded-2xl opacity-70 max-w-[75%]">
                      <p className="text-sm">{liveTranscript}</p>
                    </div>
                  </div>
                )}
                <div ref={conversationEndRef} />
              </div>
            </div>
          )}

          {/* Chat Toggle Button (when chat is closed) */}
          {sessionStarted && !isChatOpen && (
            <button
              onClick={() => setIsChatOpen(true)}
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-all z-10"
            >
              <MessageSquare size={20} />
            </button>
          )}
        </div>

        {/* Control Bar */}
        {sessionStarted && (
          <div className="h-20 bg-white border-t border-gray-200 flex items-center justify-center px-6 z-20">
            <div className="flex items-center space-x-3">
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={!sessionStarted || isLoading || wsStatus !== "connected" || isSTTStreamReady || isBotSpeaking}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-md ${
                  isRecording 
                    ? "bg-red-500 hover:bg-red-600 text-white" 
                    : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                } disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed`}
                title={isRecording ? "Stop Speaking" : "Start Speaking"}
              >
                <Mic size={20} className={isRecording ? "animate-pulse" : ""} />
              </button>

              <button 
                className="w-12 h-12 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700 flex items-center justify-center transition-all shadow-md"
                title="Toggle Video"
              >
                <Video size={20} />
              </button>

              <button 
                className="w-12 h-12 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700 flex items-center justify-center transition-all shadow-md"
                title="Share Screen"
              >
                <Monitor size={20} />
              </button>

              <button 
                onClick={() => setIsChatOpen(!isChatOpen)}
                className="w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-all shadow-md"
                title="Toggle Chat"
              >
                <MessageSquare size={20} />
              </button>

              <div className="w-px h-8 bg-gray-300 mx-2"></div>

              <button
                onClick={endSession}
                disabled={!sessionStarted}
                className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all shadow-md disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                title="End Interview"
              >
                <PhoneOff size={20} />
              </button>
            </div>
          </div>
        )}

        {/* Start Screen */}
        {!sessionStarted && (
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center z-50">
            <div className="text-center max-w-md mx-auto px-6">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-2xl">
                <span className="text-4xl">🎯</span>
              </div>
              <h2 className="text-4xl font-bold mb-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                AI Interview Portal
              </h2>
              <p className="text-gray-600 mb-8 text-lg">
                Ready to showcase your skills? Let&apos;s begin your interview session.
              </p>
              <button
                onClick={handleStartInterview}
                disabled={wsStatus !== "connected"}
                className="px-8 py-4 text-lg font-semibold rounded-xl shadow-xl transition-all duration-300 transform bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white active:scale-95 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed disabled:transform-none"
              >
                {wsStatus === "connected" ? "Start Interview" : "Connecting..."}
              </button>
              {wsStatus === "connecting" && (
                <div className="mt-4 flex items-center justify-center space-x-2 text-sm text-gray-500">
                  <Loader2 size={16} className="animate-spin" />
                  <span>Establishing connection...</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error Toast */}
        {errorMessage && (
          <div className="absolute top-20 right-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl shadow-lg z-50 max-w-sm">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold mt-0.5">!</div>
              <div className="flex-1">
                <p className="text-sm font-medium">{errorMessage}</p>
              </div>
              <button 
                onClick={() => setErrorMessage(null)}
                className="flex-shrink-0 text-red-500 hover:text-red-700"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InterviewBot;