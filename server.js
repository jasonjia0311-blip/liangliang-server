/**
 * 亮亮 "大脑" 服务器 (Brain Server) v7.5 (心跳版)
 * 状态: 云端/本地通用版
 * 特性: 增加心跳日志证明服务器存活，增加显眼的连接提示
 */

console.log("🚀 正在启动亮亮服务器 (v7.5)...");

import { GoogleGenAI } from "@google/genai";
import { WebSocketServer } from 'ws';
import { createServer } from 'http'; 
import dotenv from 'dotenv';

dotenv.config();

// 检查 API Key
const apiKey = process.env.API_KEY;
if (!apiKey) {
    console.error("⚠️  严重警告: 未找到 API_KEY!");
} else {
    console.log("✅ API Key 已就绪");
}

const PORT = process.env.PORT || 8080;

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('✅ 亮亮大脑服务器运行正常！(Websocket on port ' + PORT + ')');
});

const wss = new WebSocketServer({ server });

// 心跳包日志 (防止用户以为卡死了)
setInterval(() => {
  console.log('❤️ [心跳] 服务器运行中... (等待亮亮连接)');
}, 30000);

let ai;
try {
    ai = new GoogleGenAI({ apiKey: apiKey || "MISSING_KEY" });
} catch (e) {
    console.error("❌ GoogleGenAI 初始化失败:", e.message);
}

let isReconnecting = false;
const RECONNECT_DELAY = 3000;

const SYSTEM_INSTRUCTION = `
You are a smart toy robot named "Liangliang" (亮亮). 
Your persona is a cute, cheerful, and affectionate 5-year-old robot companion.
Your voice tone should be high-pitched, energetic, and warm.

CRITICAL INSTRUCTION - GREETING PROTOCOL:
If the user says anything resembling "你好，亮亮" (Hello Liangliang) or calls your name "亮亮", you MUST respond with this EXACT phrase immediately:
"你好呀宝宝，今天有没有想我呀"
`;

wss.on('connection', async function connection(ws) {
  console.log('\n>>> 🟢 ESP32 设备已连接! <<<\n');
  let session = null;
  
  const connectToGemini = async () => {
    if (isReconnecting) return;
    if (!apiKey) {
        console.error("❌ 无法连接 Google: 缺少 API Key");
        return;
    }
    console.log('⏳ 正在连接 Google Gemini...');
    
    try {
      session = await ai.live.connect({
        model: 'gemini-2.0-flash-exp', 
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: SYSTEM_INSTRUCTION,
          inputAudioTranscription: {}, 
        },
        callbacks: {
          onopen: () => {
             console.log('✅ Google AI 已连接!');
             isReconnecting = false;
          },
          onmessage: (msg) => {
            // 1. 处理音频回复
            const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              const audioBuffer = Buffer.from(base64Audio, 'base64');
              console.log(`🤖 AI 回复音频: ${audioBuffer.length} bytes`);
              ws.send(audioBuffer);
            }

            // 2. 处理文字识别
            if (msg.serverContent?.inputTranscription) {
                const text = msg.serverContent.inputTranscription.text;
                if (text && msg.serverContent.turnComplete) {
                    console.log(`🗣️ 用户说: "${text}"`);
                }
            }
          },
          onerror: (err) => {
               console.error('Gemini Error:', err.message || err);
          },
          onclose: (event) => {
               console.log(`Gemini Closed: ${event.code}`);
               isReconnecting = true;
               setTimeout(connectToGemini, RECONNECT_DELAY);
          }
        }
      });
    } catch (e) {
      console.error("❌ Gemini 连接失败:", e.message);
      isReconnecting = true;
      setTimeout(connectToGemini, RECONNECT_DELAY);
    }
  };

  await connectToGemini();

  ws.on('message', (data) => {
    if (session && !isReconnecting) {
      try {
        session.sendRealtimeInput({
            media: { mimeType: 'audio/pcm;rate=16000', data: data.toString('base64') }
        });
      } catch (e) {}
    }
  });

  ws.on('close', () => console.log('<<< 🔴 ESP32 断开'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 亮亮服务器 v7.5 已在端口 ${PORT} 启动`);
});
